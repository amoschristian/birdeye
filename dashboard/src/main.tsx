import { render } from 'preact';
import { CockpitApp } from './cockpit/CockpitApp';
import './fonts.css';
import './cockpit/cockpit.css';

const root = document.getElementById('app');
if (root) render(<CockpitApp />, root);
