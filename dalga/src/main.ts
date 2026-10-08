import './ui/style.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const game = new Game(canvas, ui);
(window as unknown as { __game: Game }).__game = game;
