//! A deterministic, capability-limited ActionScript-style interpreter.
//! This is not an AVM1/AVM2 or SWF interpreter. See docs/runtime.md.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as Json};
use std::collections::HashMap;

const MAX_SOURCE: usize = 65_536;
const MAX_TOKENS: usize = 32_768;
const MAX_STEPS: usize = 50_000;
const MAX_DEPTH: usize = 96;
const MAX_OUTPUT: usize = 4096;
const MAX_STRING: usize = 16_384;

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Num(f64),
    Str(String),
    Id(String),
    Sym(String),
    Eof,
}
fn lex(src: &str) -> Result<Vec<Token>, String> {
    if src.len() > MAX_SOURCE {
        return Err("Source exceeds 64 KiB limit".into());
    }
    let chars: Vec<char> = src.chars().collect();
    let mut i = 0;
    let mut out = Vec::new();
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            if i + 1 >= chars.len() {
                return Err("Unterminated comment".into());
            }
            i += 2;
            continue;
        }
        if c == '"' || c == '\'' {
            i += 1;
            let mut s = String::new();
            while i < chars.len() && chars[i] != c {
                if chars[i] == '\\' {
                    i += 1;
                    if i >= chars.len() {
                        break;
                    }
                    s.push(match chars[i] {
                        'n' => '\n',
                        'r' => '\r',
                        't' => '\t',
                        '\\' => '\\',
                        '\'' => '\'',
                        '"' => '"',
                        x => return Err(format!("Unsupported string escape: \\{x}")),
                    });
                } else {
                    s.push(chars[i]);
                }
                i += 1;
            }
            if i >= chars.len() {
                return Err("Unterminated string".into());
            }
            i += 1;
            if s.len() > MAX_STRING {
                return Err("String exceeds limit".into());
            }
            out.push(Token::Str(s));
        } else if c.is_ascii_digit()
            || (c == '.' && chars.get(i + 1).is_some_and(|x| x.is_ascii_digit()))
        {
            let start = i;
            i += 1;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            if i < chars.len() && (chars[i] == 'e' || chars[i] == 'E') {
                i += 1;
                if i < chars.len() && (chars[i] == '+' || chars[i] == '-') {
                    i += 1;
                }
                while i < chars.len() && chars[i].is_ascii_digit() {
                    i += 1;
                }
            }
            let n: f64 = chars[start..i]
                .iter()
                .collect::<String>()
                .parse()
                .map_err(|_| "Invalid numeric literal")?;
            if !n.is_finite() {
                return Err("Non-finite number".into());
            }
            out.push(Token::Num(n));
        } else if c.is_ascii_alphabetic() || c == '_' || c == '$' {
            let start = i;
            i += 1;
            while i < chars.len()
                && (chars[i].is_ascii_alphanumeric() || chars[i] == '_' || chars[i] == '$')
            {
                i += 1;
            }
            out.push(Token::Id(chars[start..i].iter().collect()));
        } else {
            let three: String = chars[i..chars.len().min(i + 3)].iter().collect();
            let two: String = chars[i..chars.len().min(i + 2)].iter().collect();
            if ["===", "!=="].contains(&three.as_str()) {
                out.push(Token::Sym(three));
                i += 3;
            } else if [
                "==", "!=", "<=", ">=", "&&", "||", "+=", "-=", "*=", "/=", "++", "--",
            ]
            .contains(&two.as_str())
            {
                out.push(Token::Sym(two));
                i += 2;
            } else if "{}();:,.+-*/%<>=!?:".contains(c) {
                out.push(Token::Sym(c.to_string()));
                i += 1;
            } else {
                return Err(format!("Unsupported character '{c}'"));
            }
        }
        if out.len() > MAX_TOKENS {
            return Err("Token budget exceeded".into());
        }
    }
    out.push(Token::Eof);
    Ok(out)
}

#[derive(Clone, Debug)]
enum Expr {
    Num(f64),
    Str(String),
    Bool(bool),
    Null,
    Var(String),
    Member(Box<Expr>, String),
    Call(Box<Expr>, Vec<Expr>),
    Unary(String, Box<Expr>),
    Binary(String, Box<Expr>, Box<Expr>),
    Assign(String, Box<Expr>, Box<Expr>),
    Update(Box<Expr>, f64),
    Conditional(Box<Expr>, Box<Expr>, Box<Expr>),
}
fn guard_expr(expr: Expr) -> Result<Expr, String> {
    fn height(e: &Expr) -> usize {
        match e {
            Expr::Member(a, _) | Expr::Unary(_, a) | Expr::Update(a, _) => 1 + height(a),
            Expr::Call(a, args) => 1 + args.iter().map(height).max().unwrap_or(0).max(height(a)),
            Expr::Binary(_, a, b) | Expr::Assign(_, a, b) => 1 + height(a).max(height(b)),
            Expr::Conditional(a, b, c) => 1 + height(a).max(height(b)).max(height(c)),
            _ => 1,
        }
    }
    if height(&expr) > MAX_DEPTH {
        Err("Expression tree depth budget exceeded".into())
    } else {
        Ok(expr)
    }
}
#[derive(Clone, Debug)]
enum Stmt {
    Empty,
    Expr(Expr),
    Var(String, Expr),
    Block(Vec<Stmt>),
    If(Expr, Box<Stmt>, Option<Box<Stmt>>),
    While(Expr, Box<Stmt>),
    For(Box<Stmt>, Option<Expr>, Option<Expr>, Box<Stmt>),
    Break,
    Continue,
}
struct Parser {
    t: Vec<Token>,
    i: usize,
    depth: usize,
}
impl Parser {
    fn peek(&self) -> &Token {
        &self.t[self.i]
    }
    fn eat(&mut self, s: &str) -> bool {
        if matches!(self.peek(), Token::Sym(x)|Token::Id(x) if x == s) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn expect(&mut self, s: &str) -> Result<(), String> {
        if self.eat(s) {
            Ok(())
        } else {
            Err(format!("Expected '{s}', found {:?}", self.peek()))
        }
    }
    fn id(&mut self) -> Result<String, String> {
        if let Token::Id(s) = self.peek().clone() {
            self.i += 1;
            Ok(s)
        } else {
            Err("Expected identifier".into())
        }
    }
    fn program(&mut self) -> Result<Vec<Stmt>, String> {
        let mut s = Vec::new();
        while *self.peek() != Token::Eof {
            s.push(self.stmt()?);
        }
        Ok(s)
    }
    fn stmt(&mut self) -> Result<Stmt, String> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err("Parser nesting budget exceeded".into());
        }
        let r = self.stmt_inner();
        self.depth -= 1;
        r
    }
    fn stmt_inner(&mut self) -> Result<Stmt, String> {
        if self.eat(";") {
            return Ok(Stmt::Empty);
        }
        if self.eat("{") {
            let mut b = Vec::new();
            while !self.eat("}") {
                if *self.peek() == Token::Eof {
                    return Err("Unterminated block".into());
                }
                b.push(self.stmt()?);
            }
            return Ok(Stmt::Block(b));
        }
        if self.eat("var") || self.eat("let") || self.eat("const") {
            let s = self.declaration()?;
            self.semi()?;
            return Ok(s);
        }
        if self.eat("if") {
            self.expect("(")?;
            let cond = self.expr(0)?;
            self.expect(")")?;
            let yes = self.stmt()?;
            let no = if self.eat("else") {
                Some(Box::new(self.stmt()?))
            } else {
                None
            };
            return Ok(Stmt::If(cond, Box::new(yes), no));
        }
        if self.eat("while") {
            self.expect("(")?;
            let cond = self.expr(0)?;
            self.expect(")")?;
            return Ok(Stmt::While(cond, Box::new(self.stmt()?)));
        }
        if self.eat("for") {
            self.expect("(")?;
            let init = if self.eat(";") {
                Stmt::Empty
            } else {
                let s = if self.eat("var") || self.eat("let") {
                    self.declaration()?
                } else {
                    Stmt::Expr(self.expr(0)?)
                };
                self.expect(";")?;
                s
            };
            let cond = if self.eat(";") {
                None
            } else {
                let e = self.expr(0)?;
                self.expect(";")?;
                Some(e)
            };
            let update = if self.eat(")") {
                None
            } else {
                let e = self.expr(0)?;
                self.expect(")")?;
                Some(e)
            };
            return Ok(Stmt::For(
                Box::new(init),
                cond,
                update,
                Box::new(self.stmt()?),
            ));
        }
        if self.eat("break") {
            self.semi()?;
            return Ok(Stmt::Break);
        }
        if self.eat("continue") {
            self.semi()?;
            return Ok(Stmt::Continue);
        }
        if let Token::Id(x) = self.peek() {
            if [
                "class", "package", "import", "function", "new", "try", "throw", "switch", "with",
                "return", "do",
            ]
            .contains(&x.as_str())
            {
                return Err(format!("Unsupported ActionScript feature: {x}"));
            }
        }
        let e = self.expr(0)?;
        self.semi()?;
        Ok(Stmt::Expr(e))
    }
    fn semi(&mut self) -> Result<(), String> {
        if self.eat(";")
            || *self.peek() == Token::Eof
            || matches!(self.peek(), Token::Sym(s) if s == "}")
        {
            Ok(())
        } else {
            Err("Expected ';' after statement".into())
        }
    }
    fn declaration(&mut self) -> Result<Stmt, String> {
        let name = self.id()?;
        if self.eat(":") {
            let ty = self.id()?;
            if ![
                "Number",
                "int",
                "uint",
                "String",
                "Boolean",
                "Object",
                "MovieClip",
                "Sprite",
            ]
            .contains(&ty.as_str())
            {
                return Err(format!("Unsupported type annotation: {ty}"));
            }
        }
        let value = if self.eat("=") {
            self.expr(0)?
        } else {
            Expr::Null
        };
        Ok(Stmt::Var(name, value))
    }
    fn expr(&mut self, min: u8) -> Result<Expr, String> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err("Expression nesting budget exceeded".into());
        }
        let r = self.expr_inner(min);
        self.depth -= 1;
        r
    }
    fn expr_inner(&mut self, min: u8) -> Result<Expr, String> {
        let t = self.peek().clone();
        self.i += 1;
        let mut lhs = guard_expr(match t {
            Token::Num(n) => Expr::Num(n),
            Token::Str(s) => Expr::Str(s),
            Token::Id(s) => match s.as_str() {
                "true" => Expr::Bool(true),
                "false" => Expr::Bool(false),
                "null" | "undefined" => Expr::Null,
                "new" | "function" | "delete" | "typeof" => {
                    return Err(format!("Unsupported ActionScript feature: {s}"))
                }
                _ => Expr::Var(s),
            },
            Token::Sym(s) if s == "(" => {
                let e = self.expr(0)?;
                self.expect(")")?;
                e
            }
            Token::Sym(s) if ["!", "-", "+"].contains(&s.as_str()) => {
                Expr::Unary(s, Box::new(self.expr(14)?))
            }
            Token::Eof => {
                self.i -= 1;
                return Err("Unexpected end of script".into());
            }
            _ => return Err(format!("Expected expression, found {t:?}")),
        })?;
        loop {
            if min <= 16 && self.eat(".") {
                lhs = guard_expr(Expr::Member(Box::new(lhs), self.id()?))?;
                continue;
            }
            if min <= 16 && self.eat("(") {
                let mut args = Vec::new();
                if !self.eat(")") {
                    loop {
                        args.push(self.expr(0)?);
                        if self.eat(")") {
                            break;
                        }
                        self.expect(",")?;
                        if args.len() > 64 {
                            return Err("Too many arguments".into());
                        }
                    }
                }
                lhs = guard_expr(Expr::Call(Box::new(lhs), args))?;
                continue;
            }
            if min <= 15 && self.eat("++") {
                lhs = guard_expr(Expr::Update(Box::new(lhs), 1.))?;
                continue;
            }
            if min <= 15 && self.eat("--") {
                lhs = guard_expr(Expr::Update(Box::new(lhs), -1.))?;
                continue;
            }
            if min <= 2 && self.eat("?") {
                let yes = self.expr(0)?;
                self.expect(":")?;
                let no = self.expr(2)?;
                lhs = guard_expr(Expr::Conditional(
                    Box::new(lhs),
                    Box::new(yes),
                    Box::new(no),
                ))?;
                continue;
            }
            let op = if let Token::Sym(s) = self.peek() {
                s.clone()
            } else {
                break;
            };
            let (l, r) = match op.as_str() {
                "=" | "+=" | "-=" | "*=" | "/=" => (1, 1),
                "||" => (3, 4),
                "&&" => (5, 6),
                "==" | "!=" | "===" | "!==" => (7, 8),
                "<" | ">" | "<=" | ">=" => (9, 10),
                "+" | "-" => (11, 12),
                "*" | "/" | "%" => (13, 14),
                _ => break,
            };
            if l < min {
                break;
            }
            self.i += 1;
            let rhs = self.expr(r)?;
            lhs = guard_expr(if l == 1 {
                Expr::Assign(op, Box::new(lhs), Box::new(rhs))
            } else {
                Expr::Binary(op, Box::new(lhs), Box::new(rhs))
            })?;
        }
        Ok(lhs)
    }
}

#[derive(Clone, Debug, PartialEq)]
enum Value {
    Num(f64),
    Str(String),
    Bool(bool),
    Null,
    Node(String),
    Root,
    Math,
    Stage,
}
impl Value {
    fn number(&self) -> Result<f64, String> {
        match self {
            Self::Num(n) => Ok(*n),
            Self::Bool(b) => Ok(if *b { 1. } else { 0. }),
            Self::Null => Ok(0.),
            Self::Str(s) => {
                let n: f64 = s.parse().map_err(|_| "Expected numeric value")?;
                if n.is_finite() {
                    Ok(n)
                } else {
                    Err("Expected finite numeric value".into())
                }
            }
            _ => Err("Expected numeric value".into()),
        }
    }
    fn truth(&self) -> bool {
        match self {
            Self::Null => false,
            Self::Bool(b) => *b,
            Self::Num(n) => *n != 0.,
            Self::Str(s) => !s.is_empty(),
            _ => true,
        }
    }
    fn text(&self) -> String {
        match self {
            Self::Num(n) => n.to_string(),
            Self::Str(s) => s.clone(),
            Self::Bool(b) => b.to_string(),
            Self::Null => "null".into(),
            Self::Node(n) => format!("[Node {n}]"),
            _ => "[Object]".into(),
        }
    }
    fn json(&self) -> Json {
        match self {
            Self::Num(n) => json!(n),
            Self::Str(s) => json!(s),
            Self::Bool(b) => json!(b),
            _ => Json::Null,
        }
    }
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    #[serde(default)]
    pub frame: f64,
    #[serde(default = "default_fps")]
    pub fps: f64,
    #[serde(default)]
    pub nodes: Vec<Json>,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub frame_labels: Vec<FrameLabel>,
}
#[derive(Deserialize)]
pub struct FrameLabel {
    pub frame: f64,
    pub name: String,
}
fn default_fps() -> f64 {
    30.
}
#[derive(Default, Debug, Serialize, Deserialize)]
pub struct Output {
    pub logs: Vec<String>,
    pub commands: Vec<Json>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub steps: usize,
}
#[derive(PartialEq)]
enum Flow {
    Next,
    Break,
    Continue,
}
struct Vm {
    vars: HashMap<String, Value>,
    nodes: HashMap<String, HashMap<String, Value>>,
    names: HashMap<String, String>,
    frame_labels: HashMap<String, f64>,
    context: Context,
    out: Output,
    steps: usize,
    depth: usize,
    output_bytes: usize,
}
impl Vm {
    fn new(context: Context) -> Self {
        let mut nodes = HashMap::new();
        let mut names = HashMap::new();
        for node in &context.nodes {
            if let Some(id) = node["id"].as_str() {
                let mut props = HashMap::new();
                if let Some(obj) = node.as_object() {
                    for (key, val) in obj {
                        let v = if let Some(n) = val.as_f64() {
                            Value::Num(n)
                        } else if let Some(s) = val.as_str() {
                            Value::Str(s.into())
                        } else if let Some(b) = val.as_bool() {
                            Value::Bool(b)
                        } else {
                            continue;
                        };
                        props.insert(key.clone(), v);
                    }
                }
                if let Some(name) = node["name"].as_str() {
                    names.insert(name.to_string(), id.to_string());
                }
                names.insert(id.to_string(), id.to_string());
                nodes.insert(id.to_string(), props);
            }
        }
        Self {
            vars: HashMap::new(),
            nodes,
            names,
            frame_labels: context
                .frame_labels
                .iter()
                .map(|label| (label.name.clone(), label.frame))
                .collect(),
            context,
            out: Output::default(),
            steps: 0,
            depth: 0,
            output_bytes: 0,
        }
    }
    fn tick(&mut self) -> Result<(), String> {
        self.steps += 1;
        if self.steps > MAX_STEPS {
            Err("Instruction budget exceeded (50000 steps); script stopped".into())
        } else {
            Ok(())
        }
    }
    fn output_budget(&mut self, bytes: usize) -> Result<(), String> {
        self.output_bytes += bytes;
        if self.output_bytes > 1_048_576 {
            Err("Output exceeds 1 MiB budget".into())
        } else {
            Ok(())
        }
    }
    fn emit(&mut self, c: Json) -> Result<(), String> {
        self.output_budget(c.to_string().len())?;
        if self.out.commands.len() >= MAX_OUTPUT {
            return Err("Command budget exceeded".into());
        }
        self.out.commands.push(c);
        Ok(())
    }
    fn statements(&mut self, stmts: &[Stmt]) -> Result<Flow, String> {
        for s in stmts {
            let f = self.stmt(s)?;
            if f != Flow::Next {
                return Ok(f);
            }
        }
        Ok(Flow::Next)
    }
    fn stmt(&mut self, s: &Stmt) -> Result<Flow, String> {
        self.tick()?;
        match s {
            Stmt::Empty => {}
            Stmt::Expr(e) => {
                self.eval(e)?;
            }
            Stmt::Var(n, e) => {
                let v = self.eval(e)?;
                self.vars.insert(n.clone(), v);
            }
            Stmt::Block(b) => return self.statements(b),
            Stmt::If(c, y, n) => {
                if self.eval(c)?.truth() {
                    return self.stmt(y);
                } else if let Some(no) = n {
                    return self.stmt(no);
                }
            }
            Stmt::While(c, b) => {
                while self.eval(c)?.truth() {
                    self.tick()?;
                    if self.stmt(b)? == Flow::Break {
                        break;
                    }
                }
            }
            Stmt::For(init, c, u, b) => {
                self.stmt(init)?;
                loop {
                    self.tick()?;
                    if let Some(cond) = c {
                        if !self.eval(cond)?.truth() {
                            break;
                        }
                    }
                    if self.stmt(b)? == Flow::Break {
                        break;
                    }
                    if let Some(update) = u {
                        self.eval(update)?;
                    }
                }
            }
            Stmt::Break => return Ok(Flow::Break),
            Stmt::Continue => return Ok(Flow::Continue),
        }
        Ok(Flow::Next)
    }
    fn eval(&mut self, e: &Expr) -> Result<Value, String> {
        self.tick()?;
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err("Evaluation nesting budget exceeded".into());
        }
        let r = self.eval_inner(e);
        self.depth -= 1;
        r
    }
    fn eval_inner(&mut self, e: &Expr) -> Result<Value, String> {
        match e {
            Expr::Num(n) => Ok(Value::Num(*n)),
            Expr::Str(s) => Ok(Value::Str(s.clone())),
            Expr::Bool(b) => Ok(Value::Bool(*b)),
            Expr::Null => Ok(Value::Null),
            Expr::Var(n) => {
                if let Some(v) = self.vars.get(n) {
                    return Ok(v.clone());
                }
                if let Some(id) = self.names.get(n) {
                    return Ok(Value::Node(id.clone()));
                }
                match n.as_str() {
                    "this" | "_root" => Ok(Value::Root),
                    "Math" => Ok(Value::Math),
                    "stage" => Ok(Value::Stage),
                    "frame" | "currentFrame" | "_currentframe" => {
                        Ok(Value::Num(self.context.frame))
                    }
                    "fps" => Ok(Value::Num(self.context.fps)),
                    _ => Err(format!("Unknown identifier: {n}")),
                }
            }
            Expr::Member(obj, p) => {
                let target = self.eval(obj)?;
                self.member(target, p)
            }
            Expr::Unary(op, e) => {
                let v = self.eval(e)?;
                match op.as_str() {
                    "!" => Ok(Value::Bool(!v.truth())),
                    "-" => Ok(Value::Num(-v.number()?)),
                    "+" => Ok(Value::Num(v.number()?)),
                    _ => unreachable!(),
                }
            }
            Expr::Binary(op, a, b) => {
                let x = self.eval(a)?;
                if op == "&&" && !x.truth() {
                    return Ok(x);
                }
                if op == "||" && x.truth() {
                    return Ok(x);
                }
                let y = self.eval(b)?;
                Self::binary(op, x, y)
            }
            Expr::Assign(op, target, rhs) => {
                let y = self.eval(rhs)?;
                let value = if op == "=" {
                    y
                } else {
                    let x = self.eval(target)?;
                    Self::binary(&op[..1], x, y)?
                };
                self.assign(target, value.clone())?;
                Ok(value)
            }
            Expr::Update(target, delta) => {
                let old = self.eval(target)?;
                let new = Value::Num(old.number()? + delta);
                self.assign(target, new)?;
                Ok(old)
            }
            Expr::Call(f, args) => {
                let mut values = Vec::new();
                for a in args {
                    values.push(self.eval(a)?);
                }
                self.call(f, values)
            }
            Expr::Conditional(c, y, n) => {
                if self.eval(c)?.truth() {
                    self.eval(y)
                } else {
                    self.eval(n)
                }
            }
        }
    }
    fn binary(op: &str, x: Value, y: Value) -> Result<Value, String> {
        if op == "+" && (matches!(x, Value::Str(_)) || matches!(y, Value::Str(_))) {
            let s = x.text() + &y.text();
            if s.len() > MAX_STRING {
                return Err("String budget exceeded".into());
            }
            return Ok(Value::Str(s));
        }
        if ["==", "===", "!=", "!=="].contains(&op) {
            let eq = x == y;
            return Ok(Value::Bool(if op.starts_with('!') { !eq } else { eq }));
        }
        if op == "&&" || op == "||" {
            return Ok(y);
        }
        let a = x.number()?;
        let b = y.number()?;
        let n = match op {
            "+" => a + b,
            "-" => a - b,
            "*" => a * b,
            "/" => a / b,
            "%" => a % b,
            "<" => return Ok(Value::Bool(a < b)),
            ">" => return Ok(Value::Bool(a > b)),
            "<=" => return Ok(Value::Bool(a <= b)),
            ">=" => return Ok(Value::Bool(a >= b)),
            _ => return Err(format!("Unsupported operator: {op}")),
        };
        if !n.is_finite() {
            return Err("Arithmetic produced a non-finite number".into());
        }
        Ok(Value::Num(n))
    }
    fn member(&self, target: Value, p: &str) -> Result<Value, String> {
        match target {
            Value::Node(id) => {
                let prop = alias(p);
                let v = self
                    .nodes
                    .get(&id)
                    .and_then(|n| n.get(prop))
                    .cloned()
                    .unwrap_or(match prop {
                        "opacity" | "scale" => Value::Num(1.),
                        "visible" => Value::Bool(true),
                        "x" | "y" | "rotation" | "width" | "height" | "rotationX" | "rotationY"
                        | "z" | "blur" | "glow" | "strokeWidth" => Value::Num(0.),
                        _ => Value::Null,
                    });
                if p == "_alpha" {
                    Ok(Value::Num(v.number()? * 100.))
                } else {
                    Ok(v)
                }
            }
            Value::Root => {
                if ["currentFrame", "_currentframe"].contains(&p) {
                    Ok(Value::Num(self.context.frame))
                } else if let Some(id) = self.names.get(p) {
                    Ok(Value::Node(id.clone()))
                } else {
                    Err(format!("Unknown root property: {p}"))
                }
            }
            Value::Math => match p {
                "PI" => Ok(Value::Num(std::f64::consts::PI)),
                "E" => Ok(Value::Num(std::f64::consts::E)),
                _ => Err(format!("Unknown Math constant: {p}")),
            },
            Value::Stage => match p {
                "stageWidth" | "width" => Ok(Value::Num(self.context.width)),
                "stageHeight" | "height" => Ok(Value::Num(self.context.height)),
                "frameRate" => Ok(Value::Num(self.context.fps)),
                _ => Err(format!("Unknown stage property: {p}")),
            },
            Value::Str(s) if p == "length" => Ok(Value::Num(s.chars().count() as f64)),
            _ => Err(format!("Property '{p}' is not available")),
        }
    }
    fn assign(&mut self, target: &Expr, mut value: Value) -> Result<(), String> {
        match target {
            Expr::Var(n) => {
                if !self.vars.contains_key(n) {
                    return Err(format!("Declare variable '{n}' before assignment"));
                }
                self.vars.insert(n.clone(), value);
                Ok(())
            }
            Expr::Member(obj, p) => {
                let v = self.eval(obj)?;
                if let Value::Node(id) = v {
                    let prop = alias(p);
                    if ![
                        "x",
                        "y",
                        "width",
                        "height",
                        "rotation",
                        "opacity",
                        "scale",
                        "visible",
                        "fill",
                        "text",
                        "stroke",
                        "strokeWidth",
                        "fontSize",
                        "rotationX",
                        "rotationY",
                        "z",
                        "blur",
                        "glow",
                        "primitive",
                        "wireframe",
                        "blendMode",
                    ]
                    .contains(&prop)
                    {
                        return Err(format!("Node property '{p}' is read-only or unsupported"));
                    }
                    if ["fill", "text", "stroke", "primitive", "blendMode"].contains(&prop) {
                        if !matches!(value, Value::Str(_)) {
                            return Err(format!("{prop} requires a string"));
                        }
                        if ["fill", "stroke"].contains(&prop) && !safe_color(&value.text()) {
                            return Err(
                                "Color must be a hex color or a supported color name".into()
                            );
                        }
                        if prop == "primitive"
                            && !["box", "sphere", "torus", "pyramid"]
                                .contains(&value.text().as_str())
                        {
                            return Err("Unsupported 3D primitive".into());
                        }
                        if prop == "blendMode"
                            && !["normal", "multiply", "screen", "overlay"]
                                .contains(&value.text().as_str())
                        {
                            return Err("Unsupported blend mode".into());
                        }
                    } else if prop == "visible" || prop == "wireframe" {
                        value = Value::Bool(value.truth());
                    } else {
                        let mut n = value.number()?;
                        if p == "_alpha" {
                            n /= 100.;
                        }
                        if !n.is_finite() || n.abs() > 1e7 {
                            return Err("Property value outside safe numeric range".into());
                        }
                        if prop == "opacity" {
                            n = n.clamp(0., 1.);
                        }
                        if ["width", "height"].contains(&prop) && n < 0. {
                            return Err("Dimensions cannot be negative".into());
                        }
                        value = Value::Num(n);
                    }
                    self.nodes
                        .get_mut(&id)
                        .ok_or("Unknown node")?
                        .insert(prop.into(), value.clone());
                    self.emit(json!({"type":"set","id":id,"property":prop,"value":value.json()}))
                } else {
                    Err("Only scene node properties can be assigned".into())
                }
            }
            _ => Err("Invalid assignment target".into()),
        }
    }
    fn call(&mut self, f: &Expr, args: Vec<Value>) -> Result<Value, String> {
        let (name, math) = match f {
            Expr::Var(n) => (n.as_str(), false),
            Expr::Member(obj, n) => match self.eval(obj)? {
                Value::Math => (n.as_str(), true),
                Value::Root => (n.as_str(), false),
                _ => return Err(format!("Method {n} is unsupported")),
            },
            _ => return Err("Dynamic function calls are unsupported".into()),
        };
        if math {
            let n = math_call(name, &args)?;
            if !n.is_finite() {
                return Err("Math result is not finite".into());
            }
            return Ok(Value::Num(n));
        }
        match name {
            "trace" => {
                if self.out.logs.len() >= MAX_OUTPUT {
                    return Err("Log budget exceeded".into());
                }
                let text = args.iter().map(Value::text).collect::<Vec<_>>().join(" ");
                if text.len() > MAX_STRING {
                    return Err("Log string budget exceeded".into());
                }
                self.output_budget(text.len())?;
                self.out.logs.push(text);
            }
            "play" | "stop" => {
                arity(&args, 0)?;
                self.emit(json!({"type":name}))?;
            }
            "gotoAndPlay" | "gotoAndStop" => {
                arity(&args, 1)?;
                let frame = match &args[0] {
                    Value::Str(label) => *self
                        .frame_labels
                        .get(label)
                        .ok_or_else(|| format!("Unknown frame label: {label}"))?,
                    value => value.number()?,
                };
                if !frame.is_finite() || !(0. ..=1_000_000.).contains(&frame) {
                    return Err("Frame must be between 0 and 1000000".into());
                }
                self.emit(
                    json!({"type":"goto","frame":frame.floor(),"play":name == "gotoAndPlay"}),
                )?;
            }
            "getNode" => {
                arity(&args, 1)?;
                let name = args[0].text();
                let id = self
                    .names
                    .get(&name)
                    .ok_or_else(|| format!("Unknown scene node: {name}"))?;
                return Ok(Value::Node(id.clone()));
            }
            "Number" | "int" | "uint" => {
                arity(&args, 1)?;
                let n = args[0].number()?;
                if !n.is_finite() {
                    return Err("Number must be finite".into());
                }
                return Ok(Value::Num(match name {
                    "int" => {
                        let u = n.trunc().rem_euclid(4_294_967_296.);
                        if u >= 2_147_483_648. {
                            u - 4_294_967_296.
                        } else {
                            u
                        }
                    }
                    "uint" => n.trunc().rem_euclid(4_294_967_296.),
                    _ => n,
                }));
            }
            "String" => {
                arity(&args, 1)?;
                return Ok(Value::Str(args[0].text()));
            }
            "Boolean" => {
                arity(&args, 1)?;
                return Ok(Value::Bool(args[0].truth()));
            }
            _ => return Err(format!("Unsupported function: {name}")),
        }
        Ok(Value::Null)
    }
}
fn safe_color(s: &str) -> bool {
    (s.starts_with('#')
        && [4, 5, 7, 9].contains(&s.len())
        && s[1..].chars().all(|c| c.is_ascii_hexdigit()))
        || [
            "none",
            "transparent",
            "black",
            "white",
            "red",
            "green",
            "blue",
            "yellow",
            "cyan",
            "magenta",
            "orange",
            "purple",
            "gray",
            "grey",
        ]
        .contains(&s)
}
fn alias(p: &str) -> &str {
    match p {
        "_x" => "x",
        "_y" => "y",
        "_width" => "width",
        "_height" => "height",
        "_rotation" => "rotation",
        "_alpha" | "alpha" => "opacity",
        "_visible" => "visible",
        _ => p,
    }
}
fn arity(args: &[Value], n: usize) -> Result<(), String> {
    if args.len() == n {
        Ok(())
    } else {
        Err(format!("Expected {n} arguments, received {}", args.len()))
    }
}
fn math_call(name: &str, args: &[Value]) -> Result<f64, String> {
    if ["min", "max"].contains(&name) {
        if args.is_empty() {
            return Err("Math.min/max requires an argument".into());
        }
        let mut n = args[0].number()?;
        for a in &args[1..] {
            let v = a.number()?;
            n = if name == "min" { n.min(v) } else { n.max(v) };
        }
        return Ok(n);
    }
    if ["pow", "atan2"].contains(&name) {
        arity(args, 2)?;
        return Ok(if name == "pow" {
            args[0].number()?.powf(args[1].number()?)
        } else {
            args[0].number()?.atan2(args[1].number()?)
        });
    }
    arity(args, 1)?;
    let x = args[0].number()?;
    match name {
        "sin" => Ok(x.sin()),
        "cos" => Ok(x.cos()),
        "tan" => Ok(x.tan()),
        "sqrt" => Ok(x.sqrt()),
        "abs" => Ok(x.abs()),
        "floor" => Ok(x.floor()),
        "ceil" => Ok(x.ceil()),
        "round" => Ok(x.round()),
        _ => Err(format!("Unsupported Math function: {name}")),
    }
}

pub fn run(source: &str, context: Context) -> Output {
    if context.nodes.len() > 4096 {
        return Output {
            error: Some("Context exceeds 4096 nodes".into()),
            ..Default::default()
        };
    }
    if context.frame_labels.len() > 1000 {
        return Output {
            error: Some("Context exceeds 1000 frame labels".into()),
            ..Default::default()
        };
    }
    let mut label_names = HashMap::new();
    for label in &context.frame_labels {
        if label.name.is_empty() || label.name.len() > 100 {
            return Output {
                error: Some("Frame label names must contain 1 to 100 characters".into()),
                ..Default::default()
            };
        }
        if !label.frame.is_finite()
            || label.frame.fract() != 0.0
            || !(0. ..=1_000_000.).contains(&label.frame)
        {
            return Output {
                error: Some("Frame labels must target integer frames between 0 and 1000000".into()),
                ..Default::default()
            };
        }
        if label_names.insert(&label.name, label.frame).is_some() {
            return Output {
                error: Some(format!("Duplicate frame label: {}", label.name)),
                ..Default::default()
            };
        }
    }
    let parsed = lex(source).and_then(|t| Parser { t, i: 0, depth: 0 }.program());
    let stmts = match parsed {
        Ok(s) => s,
        Err(error) => {
            return Output {
                error: Some(error),
                ..Default::default()
            }
        }
    };
    let mut vm = Vm::new(context);
    match vm.statements(&stmts) {
        Ok(Flow::Next) => {}
        Ok(_) => vm.out.error = Some("break/continue outside loop".into()),
        Err(error) => vm.out.error = Some(error),
    }
    if vm.out.error.is_some() {
        vm.out.commands.clear();
    }
    vm.out.steps = vm.steps;
    vm.out
}
#[derive(Deserialize)]
struct Request {
    source: String,
    #[serde(default)]
    context: Context,
}
pub fn run_json(input: &str) -> String {
    let result = if input.len() > 2_097_152 {
        Output {
            error: Some("Request exceeds 2 MiB limit".into()),
            ..Default::default()
        }
    } else {
        match serde_json::from_str::<Request>(input) {
            Ok(r) => run(&r.source, r.context),
            Err(e) => Output {
                error: Some(format!("Invalid runtime request: {e}")),
                ..Default::default()
            },
        }
    };
    serde_json::to_string(&result).unwrap_or_else(|_| {
        "{\"logs\":[],\"commands\":[],\"error\":\"Serialization failed\"}".into()
    })
}

// Raw WASM ABI keeps browser delivery free of generated JS and binding dependencies.
#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::run_json;
    static mut RESULT_LEN: usize = 0;
    #[no_mangle]
    pub extern "C" fn rash_alloc(len: usize) -> *mut u8 {
        if len > 2_097_152 {
            return std::ptr::null_mut();
        }
        let bytes = vec![0u8; len].into_boxed_slice();
        Box::into_raw(bytes) as *mut u8
    }
    #[no_mangle]
    pub unsafe extern "C" fn rash_dealloc(ptr: *mut u8, len: usize) {
        if !ptr.is_null() {
            drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
        }
    }
    #[no_mangle]
    pub unsafe extern "C" fn rash_run(ptr: *const u8, len: usize) -> *mut u8 {
        let output = if ptr.is_null() || len > 2_097_152 {
            "{\"logs\":[],\"commands\":[],\"error\":\"Invalid input buffer\"}".into()
        } else {
            match std::str::from_utf8(std::slice::from_raw_parts(ptr, len)) {
                Ok(s) => run_json(s),
                Err(_) => "{\"logs\":[],\"commands\":[],\"error\":\"Input must be UTF-8\"}".into(),
            }
        };
        let bytes = output.into_bytes().into_boxed_slice();
        RESULT_LEN = bytes.len();
        Box::into_raw(bytes) as *mut u8
    }
    #[no_mangle]
    pub unsafe extern "C" fn rash_result_len() -> usize {
        RESULT_LEN
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ctx() -> Context {
        serde_json::from_value(json!({"frame":12,"fps":30,"width":1280,"height":720,"frameLabels":[{"frame":3,"name":"Intro"},{"frame":24,"name":"Outro"}],"nodes":[{"id":"hero1","name":"hero","x":10,"y":20,"opacity":1}]})).unwrap()
    }
    fn execute(s: &str) -> Output {
        let r = run(s, ctx());
        assert!(r.error.is_none(), "{:?}", r.error);
        r
    }
    #[test]
    fn precedence_and_typed_variables() {
        assert_eq!(
            execute("var x:Number = 2 + 3 * 4; trace(x); trace((2+3)*4);").logs,
            vec!["14", "20"]
        );
    }
    #[test]
    fn loops_condition_and_updates() {
        assert_eq!(execute("var s:int = 0; for(var i:int = 0; i < 10; i++) { if(i == 3) continue; if(i > 5) break; s += i; } trace(s);").logs,vec!["12"]);
    }
    #[test]
    fn while_and_short_circuit() {
        assert_eq!(execute("var i=0; while(i < 3) { i++; } if(true || missing) trace(i); trace(false && absent);").logs,vec!["3","false"]);
    }
    #[test]
    fn scene_properties_are_commands() {
        let r = execute("hero.x += 12; this.hero._alpha=50; var n:MovieClip=getNode('hero1'); n.y=Math.sin(Math.PI/2)*100; trace(hero.x);");
        assert_eq!(r.logs, vec!["22"]);
        assert_eq!(
            r.commands[0],
            json!({"type":"set","id":"hero1","property":"x","value":22.0})
        );
        assert_eq!(r.commands[1]["value"], json!(0.5));
        assert_eq!(r.commands[2]["value"], json!(100.0));
    }
    #[test]
    fn timeline_controls() {
        let r = execute("stop(); gotoAndPlay(24); this.play(); _root.gotoAndStop(12); gotoAndPlay('Intro'); gotoAndStop('Outro');");
        assert_eq!(r.commands.len(), 6);
        assert_eq!(
            r.commands[1],
            json!({"type":"goto","frame":24.0,"play":true})
        );
        assert_eq!(r.commands[4], json!({"type":"goto","frame":3.0,"play":true}));
        assert_eq!(r.commands[5], json!({"type":"goto","frame":24.0,"play":false}));
        let missing = run("hero.x=99;gotoAndStop('Missing');", ctx());
        assert!(missing.error.unwrap().contains("Unknown frame label"));
        assert!(missing.commands.is_empty());
    }
    #[test]
    fn three_and_effect_properties_are_bounded_scene_commands() {
        let r=execute("hero.rotationX=25; hero.rotationY+=90; hero.z=40; hero.blur=4; hero.glow=8; hero.primitive='torus'; hero.wireframe=true; hero.blendMode='screen'; hero.stroke='#4488ff'; hero.strokeWidth=2; hero.fontSize=64;");
        assert_eq!(r.commands.len(), 11);
        assert_eq!(r.commands[1]["value"], json!(90.0));
        assert_eq!(r.commands[5]["value"], json!("torus"));
        assert_eq!(r.commands[6]["value"], json!(true));
        for source in [
            "hero.primitive='url(evil)';",
            "hero.blendMode='url(evil)';",
            "hero.stroke='url(evil)';",
            "hero.rotationX=100000000;",
        ] {
            let result = run(source, ctx());
            assert!(result.error.is_some());
            assert!(result.commands.is_empty());
        }
    }
    #[test]
    fn injection_not_executable() {
        for src in [
            "eval('alert(1)');",
            "fetch('https://evil.example');",
            "hero.innerHTML='evil';",
            "new Function('x');",
            "import flash.display.Sprite;",
            "class A {}",
        ] {
            assert!(run(src, ctx()).error.is_some(), "{src}");
        }
    }
    #[test]
    fn infinite_loop_is_bounded_and_transactional() {
        let r = run("hero.x=99; while(true) {}", ctx());
        assert!(r.error.unwrap().contains("budget"));
        assert!(r.commands.is_empty());
        assert!(r.steps <= MAX_STEPS + 1);
    }
    #[test]
    fn command_budget() {
        let r = run("for(var i=0;i<5000;i++) hero.x=i;", ctx());
        assert!(r.error.is_some());
        assert!(r.commands.is_empty());
    }
    #[test]
    fn syntax_and_unknown_names() {
        for src in [
            "var x = ;",
            "trace(missing);",
            "var x=1 var y=2;",
            "if (true) {",
            "x=1;",
            "break;",
        ] {
            assert!(run(src, ctx()).error.is_some(), "{src}");
        }
    }
    #[test]
    fn nonfinite_is_rejected() {
        for src in [
            "trace(1/0);",
            "hero.x=-1e300;",
            "trace(Math.sqrt(-1));",
            "trace(1e999);",
        ] {
            assert!(run(src, ctx()).error.is_some(), "{src}");
        }
    }
    #[test]
    fn nested_expressions_bounded() {
        let src = format!("trace({}1{});", "(".repeat(500), ")".repeat(500));
        assert!(run(&src, ctx()).error.unwrap().contains("nesting"));
    }
    #[test]
    fn strings_comments_and_ternary() {
        assert_eq!(execute("// hello\nvar x = 'Rash'; /* ok */ trace(x + ' SVG', x.length); trace(2>1?'yes':'no');").logs,vec!["Rash SVG 4","yes"]);
    }
    #[test]
    fn source_and_request_limits() {
        assert!(run(&" ".repeat(MAX_SOURCE + 1), ctx()).error.is_some());
        assert!(run_json("not json").contains("Invalid runtime request"));
    }
    #[test]
    fn flat_tree_depth_bounded() {
        let src = format!("trace({});", vec!["1"; 1000].join("+"));
        assert!(run(&src, ctx()).error.unwrap().contains("depth"));
    }
    #[test]
    fn svg_fill_url_rejected() {
        assert!(run("hero.fill='url(https://evil.example)';", ctx())
            .error
            .is_some());
        assert_eq!(execute("hero.fill='#ff8800';").commands.len(), 1);
    }
    #[test]
    fn total_output_bounded() {
        let src = format!(
            "var s='{}'; for(var i=0;i<100;i++) trace(s);",
            "A".repeat(16384)
        );
        assert!(run(&src, ctx()).error.unwrap().contains("Output"));
    }
    #[test]
    fn stage_read_only() {
        assert_eq!(
            execute("trace(stage.stageWidth,stage.stageHeight,currentFrame,fps);").logs,
            vec!["1280 720 12 30"]
        );
        assert!(run("stage.frameRate=120;", ctx()).error.is_some());
    }
    #[test]
    fn integer_coercion_wraps() {
        assert_eq!(
            execute("trace(int(4294967295),uint(-1));").logs,
            vec!["-1 4294967295"]
        );
    }
    #[test]
    fn malformed_source_never_panics() {
        let alphabet = b"abc{}[]()0123;,.+-*/=!&|:' ";
        let mut seed: u64 = 1234567;
        for _ in 0..1000 {
            let mut src = String::new();
            for _ in 0..128 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                src.push(alphabet[(seed >> 32) as usize % alphabet.len()] as char);
            }
            let _ = run(&src, ctx());
        }
    }
    #[test]
    fn no_state_leak_between_runs() {
        execute("var x=1;");
        assert!(run("trace(x);", ctx()).error.is_some());
    }
}
