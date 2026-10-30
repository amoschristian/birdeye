import { render } from 'preact';
import { App } from './App';
import './fonts.css';
import './style.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
