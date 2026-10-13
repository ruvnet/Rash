# Rash user guide

[Open Rash Studio](https://ruvnet.github.io/Rash/) · [Animation gallery](https://ruvnet.github.io/Rash/examples/) · [README](../README.md) · [Compatibility](compatibility.md)

Rash creates editable SVG compositions with vector layers, keyframes, projected 3D geometry and reusable graphic symbols. The studio runs in your browser. Save project JSON to keep an editable backup; browser autosave is local to that browser and device.

## Your first animation

1. Open the studio and choose a template, or create a blank composition. Download your current project before replacing it.
2. Choose Rectangle, Ellipse, Text or Freehand and draw on the stage. Select the new object to edit its fill, dimensions and position in **Properties**.
3. At frame 1, add a keyframe. Move the playhead forward, then move the object to its destination.
4. Open **Motion** to adjust easing, or apply a motion preset such as Rise, Pop or Float. Presets create editable keys. They must fit inside the composition.
5. Press Play to inspect the result. Use **File → Save project** for an editable `.rash.json` copy, then **Export** for a deliverable.

A ready made example is the fastest starting point. In the [gallery](https://ruvnet.github.io/Rash/examples/), download **Project JSON**, then use **File → Open project** in the studio.

## Edit and delete on mobile

1. Tap an object, or select it through **Layers**. A fully masked object remains selectable in Layers.
2. Use **Edit**, **Duplicate** and **Delete** above the stage. Locked layers must be unlocked before editing.
3. In **Edit**, change precise values in the inspector. For text, choose **Edit text content**, enter your text and apply it. Corner handles resize supported shapes.
4. Use the visible **Undo** or **Redo** controls to recover an edit. Delete removes the selected instance, not the shared symbol definition.
5. **More** opens the complete menu, including **Open project**, **Download project**, **Export composition**, **Scene camera**, **Symbol library**, **Actions script editor** and **Help and shortcuts**.
6. Use **Motion** to enter an exact frame and add, edit or remove a keyframe without a keyboard.
7. Use **More → Frame operations** to insert or remove time, name a frame, author blank or exposed keyframes, or copy the selected layer's current pose to another frame.

If an inspector covers the stage, close it before selecting a different object. Saving and exporting while inside a symbol preserve the entire project.

## Timing, curves and masks

The timeline presents frames; motion dialogs also accept seconds. Changing FPS preserves key and frame-label timing in seconds with frame rounding. In Motion, select an individual **Motion property** to give position, rotation, opacity or another track its own easing. **All properties** resets the per property overrides.

Choose **Frames** beside the desktop transport, or **More → Frame operations** on mobile. **Insert frames** shifts every layer key, camera key, frame label and affected symbol start offset at or after the playhead. **Remove frames** deletes keys and labels in the removed span and shifts later timing earlier while always retaining at least one composition frame. Add a unique **Frame label** at the playhead to mark moments such as Intro, Loop or Exit; its flag appears above the timeline and selecting it seeks that exact frame. Root-scene scripts can seek these exact, case-sensitive names with `gotoAndPlay("Intro")` or `gotoAndStop("Exit")`. Labels inside graphic-symbol definitions remain authoring markers because graphic symbols do not run independent scripts. Labels are not frame scripts. **Blank keyframe** hides the selected layer from the playhead until a later **Expose layer** or ordinary keyframe; the hollow diamond on the timeline identifies a blank. **Copy pose** samples every animated property plus exposure state at the playhead and writes an editable key at the destination. Each operation is atomic and creates one Undo step.

Use the **Onion skin** circle beside the desktop Timeline title, or **More → Onion skin** on mobile, to compare the adjacent previous and next evaluated frames. The magenta and green retained-SVG ghosts are noninteractive, stop at composition boundaries and disappear during playback, game preview and export. This is a device-local editor preference; it does not modify project JSON or published output.

Select an animated layer and open the **Motion** inspector to see its evaluated position trajectory on the stage. The dashed SVG trail samples the same evaluator used by playback, marks authored position keyframes and highlights the current evaluated center. Drag a white keyframe marker to edit that key's X/Y position directly; one drag creates one Undo step, and sparse position keys gain their evaluated missing axis when moved.

For a curved segment, select its destination position key, open **Spatial path** and choose **Enable spatial curve**. The selected destination and its nearest preceding position key must each contain explicit X and Y values; when there is no preceding position key, the node's base pose is the start. The initial controls preserve the straight trajectory. Drag either tangent on the stage to shape the curve: the OUT handle is relative to the previous endpoint and the IN handle is relative to the selected destination. The destination key's main easing curve controls progress along the whole spatial path; independent X/Y timing overrides remain stored but are ignored for that segment until the spatial curve is removed. **Remove spatial curve** restores the legacy straight segment without discarding other timing settings. Enabling, removing and each complete tangent drag are separate Undo steps.

On a phone, choose Motion and close the inspector panel to give the stage more room before dragging. Each invisible key or tangent hit target remains at least 44 CSS pixels wide even when the composition is zoomed out. Sampling is bounded to 96 points and key markers are bounded to 49, so long compositions remain predictable. Locked layers have no draggable handles. A complete drag is one Undo step, and invalid edits roll back. The trail and handles disappear outside Motion mode and during playback or preview, and never enter exported artwork. SVG and embed playback nevertheless follow the curve because they reuse the same evaluated positions. Spatial curves are attached to one keyframe segment; reusable guide layers, path attachment and automatic orientation are not implemented.

For a wipe or iris, select a layer and open **Properties → Reveal mask**. Choose Rectangle or Ellipse, adjust the local bounds, then choose **Animate mask**. Move to another frame before changing mask values to animate them. **Fit mask to layer** restores the bounds for the current frame. **Remove mask** clears the mask and its animation as one undoable edit.

Masks use hard clipping. Feathering, inversion and masks that reference another layer are not implemented.

## Shared symbols

1. Select artwork and choose **Edit → Convert to symbol**, **Properties → Convert to symbol**, or **More → Convert to symbol** on a phone.
2. Name the definition, then open **Library**. **Place instance** creates another placement of the same artwork.
3. Choose **Edit symbol** to open the definition's stage and timeline. A change updates every instance. The breadcrumb returns to the parent or Scene.
4. Select an instance to choose **Loop**, **Play once** or **Single frame**, and adjust its first frame and parent start offset.
5. To remove a placement, select it and choose Delete. To delete a definition, remove its references first, then use the Library action.

Definitions can contain other symbols. Circular references are rejected. Each definition has its own size, camera and duration, and shares the document FPS. Symbols use schema version 2 and require a compatible player. Their clocks follow the parent timeline; independent MovieClip clocks, button states and frame scripts are still on the [delivery plan](flash-parity.md). Apply blur and glow to artwork inside a symbol; those effects are unavailable on symbol containers.

## 3D and professional motion workflows

Open **3D**, or **More → 3D objects and camera**, to add a box, sphere, torus or pyramid. Properties exposes rotation, depth, wireframe, blur, glow and blend mode. These are Three.js geometries projected into SVG faces.

For a camera move:

1. Open **Scene camera** and choose the starting frame.
2. Adjust yaw, pitch, distance and field of view, then choose **Set camera keyframe**.
3. Move to a later frame, choose another pose and set another camera keyframe.
4. Preview, then edit easing or remove a camera keyframe in the same dialog.

**Apply camera** changes the base pose while preserving keys; animated keys take precedence. The scene camera affects 3D layers while ordinary text and vector layers retain their canvas positions.

Combine the **Beyond / 3D motion** template with independently eased typography, geometric masks and staggered motion for layered title sequences. The [six example projects](../web/examples/) progress from a single moving shape to a complete motion composition. There is no AEP import, After Effects expression engine, textured 3D scene or shared depth buffer between separate mesh layers.

## Export and embed

Open **Export**, or **More → Export composition**. Choose the output according to its purpose:

| Output | Result and limits |
| :--- | :--- |
| Project JSON | Editable source, including layers, keys, symbols and scripts. Use for backup and transfer. |
| Animated SVG | Portable vector animation. Sampled 3D geometry can produce large files. Export limit: 16 MB. |
| PNG | Full resolution still of the first frame. |
| GIF | Browser rendered animation, capped at 640 pixels and 120 sampled frames. |
| MP4 | Real time recording where the browser supports the encoder, capped at 1920 pixels and 60 seconds. Unsupported browsers report an error. |
| PDF | Raster still of frame zero for printing. It is not animated or a vector PDF. |
| HTML | Self contained animation player. Scene scripts do not run in this export. |

Use **Get embed code** to copy a player with inline project data. For a separately hosted project:

```html
<script type="module" src="https://ruvnet.github.io/Rash/embed.js"></script>
<rash-player src="/scene.rash.json" controls autoplay loop
  style="display:block;width:100%;aspect-ratio:16/9"></rash-player>
```

Host the JSON where the visitor's browser can fetch it. Cross origin requests require the appropriate CORS response; your content security policy must allow the module and project URL. Each player has independent state. See the [embedding guide](embed.md) for the player API and deployment details.

## Scripts, resources and games

Open **Actions script editor** to run the documented ActionScript inspired subset. The Rust/WASM worker enforces execution and output budgets. A failed run discards its scene commands. Scripts cannot access the DOM, browser storage, network or operating system.

Numeric timeline navigation remains available, and validated root-scene frame labels can be used as exact string targets. An unknown label rejects the complete run, including any earlier property commands. Multiple scenes, frame scripts and independent MovieClip scripts are not implemented.

```actionscript
var total:Number = 0;
for (var i:int = 0; i < 10; i++) {
  total += i;
}
trace(total);
stop();
```

The [compatibility matrix](compatibility.md) is the contract for supported language features. Existing SWFs use the separate optional Ruffle player; native source `.as` does not compile into SWF.

**Browse rash:// resources** resolves local allowlisted addresses such as `rash://project/current`, `rash://node/ID` and `rash://symbol/ID`. This studio registry makes no network request and is distinct from the MCP server's resource transport.

The Orbit Collector template supports touch and keyboard play in the editor and embed. Its temporary game state does not replace authored artwork. It is a demo, not a complete game engine.

## ChatGPT, MCP and Claude

The repository provides a local MCP server for one local user's project store. Start it with Node using an absolute repository path:

```sh
node /absolute/path/Rash/mcp/server.mjs
```

The process uses MCP over standard input and output. Configure your MCP client to launch `node` with that script as its argument. The default store is `~/.rash/projects`; set `RASH_MCP_STORE` to an absolute directory to choose another location. This is local persistence, separate from the studio's browser autosave. It is not a public multiuser service. Limits are 100 projects, 100 MB total and 5 MB per project.

| Tool | Use |
| :--- | :--- |
| `rash_project_create` | Validate and store a new project. |
| `rash_project_list` | List projects in the local store. |
| `rash_project_get` | Retrieve the project and its current revision. |
| `rash_project_update` | Save changes with `expectedRevision` from the last read. |
| `rash_project_delete` | Delete a project with its `expectedRevision`. |
| `rash_render` | Render an exact project `revision` as SVG. |
| `rash_export` | Export an exact `revision` as `json`, `svg`, `animated-svg` or `embed`. |

The server exposes project resources at `rash://project/UUID`. When a revision conflicts, read the current project and reconcile the changes before retrying; do not overwrite another edit blindly. GIF, MP4, PNG and PDF exports remain browser workflows. Tool schemas describe the complete required arguments.

Install the Claude package with:

```text
/plugin marketplace add ruvnet/Rash
/plugin install rash@rash-tools
```

The local plugin launches the repository server using `${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs`. Validate installation against your Claude host version. The browser studio works independently of an AI host, and its local projects do not automatically appear in the MCP store.

**Host verification boundary:** source implementation and automated protocol or UI tests do not establish a live ChatGPT or Claude connection. A deployed HTTPS MCP endpoint and a real connected host session must be verified separately. The private Plugin Launchpad demo is a separate service; its availability does not establish Rash integration.

For host acceptance, create a project, display its SVG, play and seek, edit a layer, save, reopen, export, then confirm deletion. MCP project deletion is permanent; layer deletion and undo are full studio workflows. Repeat project round trips for a shared symbol and confirm that another user's project cannot be accessed. Protocol tests and standalone browser tests provide evidence for individual components; they do not replace this real host session.

## Recovery and troubleshooting

| Symptom | Action |
| :--- | :--- |
| Cannot select artwork | Use Layers; check the lock state and whether a mask hides it. |
| Editing changes every copy | You are editing a shared symbol definition. Return to Scene to change only an instance's transform. |
| Camera changes appear ignored | Check for camera keys at that frame. Keys override the base pose. |
| A motion preset fails | Shorten its duration or delay so it fits the composition. |
| Browser cannot save locally | Download project JSON immediately. Local storage may be disabled or full. |
| MP4 is unavailable | Use GIF, SVG or HTML, or a browser with the required encoder. |
| SVG export is too large | Reduce duration, frame rate or mesh detail; use a retained JavaScript embed for complex 3D motion. |
| Symbol project fails in an old player | Update the player to a release supporting schema version 2. |
| Imported Flash content differs | Check Ruffle's upstream compatibility; full Flash and ActionScript parity is unfinished. |

Open **Help and shortcuts** for in app guidance. For reproducible bug reports, include browser and device, the smallest project JSON that reproduces the problem, the steps, and the expected result. Remove private content before publishing a report.


## Shared cloud projects in Studio

Open https://rash-svg-studio.ruv.chatgpt.site/studio/ and sign in with the account authorized for the Rash private workspace. Choose **MCP → Manage cloud projects**. On mobile, open **More → MCP connections and setup → Manage cloud projects**.

1. Select a saved project, confirm replacement of the current composition and choose **Open selected project**. Download any local work you need first.
2. Edit with the full Studio controls. Device autosave does not update cloud storage.
3. Reopen Cloud projects and choose **Save linked revision**. ChatGPT can now read the new revision through `rash_project_get`.
4. If another editor saved first, the conflict preserves your local composition. Choose **Save as new cloud project** to retain both versions, or explicitly reopen the latest cloud project.
5. To delete, select a project, choose **Delete selected project**, and confirm the named revision. The device composition is preserved.

After a cloud project opens, keyboard focus returns to the composition title. You can rename immediately with Enter or continue through the Studio controls without an invisible dialog retaining focus.

The public GitHub Studio provides a link to the authenticated Studio. Transfer public or local Claude projects with JSON download/import, then save as a new cloud project. No credentials are copied between origins. Refreshing the browser retains the device draft but requires reopening a cloud project or saving a new copy to establish a cloud link.
