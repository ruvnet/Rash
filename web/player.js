import './embed.js';
import { parseProject } from './core/model.js';
const player = document.querySelector('rash-player');
const params = new URLSearchParams(location.search);
const source = params.get('src');
if (source) player.setAttribute('src', source);
else if (location.hash.startsWith('#project=')) {
  try { player.project = parseProject(decodeURIComponent(location.hash.slice(9))); }
  catch (error) { document.querySelector('#message').textContent = error.message; }
} else document.querySelector('#message').textContent = 'Add ?src=https://example.com/project.rash.json to load a project.';
// Parent messages are accepted only from the embedding parent and same origin.
addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'rash-project') return;
  try { player.project = event.data.project; }
  catch (error) { document.querySelector('#message').textContent = error.message; }
});
