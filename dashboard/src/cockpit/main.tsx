import { render } from 'preact';
import { CockpitApp } from './CockpitApp';
import '../fonts.css';
import './cockpit.css';

const root = document.getElementById('app');
if (root) render(<CockpitApp />, root);
