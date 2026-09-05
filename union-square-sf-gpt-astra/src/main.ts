import './style.css';
import { createRuntime } from './runtime';
import { buildWorld } from './world';
createRuntime(buildWorld).catch(error => {
  console.error(error);
  document.querySelector('#loading strong')!.textContent='The square could not load';
  document.querySelector('#loading-detail')!.textContent=String(error);
});
