/** rash:// is a local resource address, never a network or operating system URL. */
const TYPES = new Set(['project', 'template', 'node', 'help']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function parseRashURI(value) {
  if (typeof value !== 'string' || value.length > 180) throw new TypeError('Invalid Rash resource URI');
  const match = /^rash:\/\/([a-z]+)\/([^/?#]+)$/.exec(value);
  if (!match || !TYPES.has(match[1])) throw new TypeError('Unsupported Rash resource URI');
  let id;
  try { id = decodeURIComponent(match[2]); } catch { throw new TypeError('Invalid resource encoding'); }
  if (!ID.test(id) || id === '.' || id === '..' || id.includes('..')) throw new TypeError('Invalid resource identifier');
  return Object.freeze({ scheme: 'rash', type: match[1], id, uri: `rash://${match[1]}/${id}` });
}

export const RESOURCE_HELP = Object.freeze({
  welcome: { title: 'Rash Studio', text: 'Create SVG scenes, animate a timeline, preview and export. Save project JSON to keep an independent copy.' },
  actionscript: { title: 'ActionScript compatibility', text: 'Rash supports a bounded scripting subset. Optional legacy.html plays SWFs with isolated Ruffle; neither path promises complete Flash compatibility. See docs/compatibility.md.' },
  embed: { title: 'Embed a scene', text: 'Export an embed and host its assets over HTTPS. Use the generated JavaScript or a sandboxed iframe. Projects do not receive host page access.' },
  privacy: { title: 'Local projects', text: 'Project autosave stays in this browser. Clearing site data removes it. Export project JSON for backup.' }
});

/** All dependencies are supplied by the application; resolving a URI cannot execute a command. */
export function createResourceRegistry({ getProject, templates = [], help = RESOURCE_HELP, controls = {} } = {}) {
  function project() { return typeof getProject === 'function' ? getProject() : undefined; }
  return Object.freeze({
    resolve(value) {
      const resource = parseRashURI(value);
      let result;
      if (resource.type === 'project') {
        const p = project();
        if (p && (resource.id === 'current' || resource.id === p.id)) result = p;
      } else if (resource.type === 'node') result = project()?.nodes?.find(n => n.id === resource.id);
      else if (resource.type === 'template') result = templates.find(t => t.id === resource.id);
      else if (resource.type === 'help' && Object.hasOwn(help, resource.id)) result = help[resource.id];
      if (result === undefined) throw new Error(`Resource not found: ${resource.uri}`);
      return { ...resource, value: structuredClone(result) };
    },
    list() {
      const p = project();
      return [
        ...(p ? ['rash://project/current', ...(p.nodes ?? []).map(n => `rash://node/${n.id}`)] : []),
        ...templates.map(t => `rash://template/${t.id}`),
        ...Object.keys(help).map(key => `rash://help/${key}`)
      ].filter(uri => { try { parseRashURI(uri); return true; } catch { return false; } });
    },
    control(action, value) {
      if (!['play', 'pause', 'seek', 'select'].includes(action)) throw new TypeError('Unsupported player control');
      if (action === 'seek' && (!Number.isInteger(value) || value < 0 || value >= (project()?.duration ?? 0))) throw new RangeError('Seek is outside the project frame range');
      if (action === 'select' && !project()?.nodes?.some(n => n.id === value)) throw new TypeError('Unknown scene node');
      if (typeof controls[action] !== 'function') throw new Error('Player control unavailable');
      return controls[action](value);
    }
  });
}
