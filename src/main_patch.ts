import * as THREE from "three";
import { ProductionPlanner } from "./bim-components/ProductionPlanner";

// Beispielhafte Integration (Anpassen an dein bestehendes World-Setup)
const world = /* ... dein bestehendes World-Setup ... */ null as any;

const planner = new ProductionPlanner(world, {
  tableSize: { width: 2.0, depth: 1.0, height: 0.75, thickness: 0.05 },
  snap: 0.05,
});
planner.mount();

const pointerNdc = new THREE.Vector2();

function toNdc(event: MouseEvent, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerNdc.set(x, y);
}

const canvas = (world.renderer?.canvas ??
  document.querySelector("canvas")) as HTMLCanvasElement;
canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
  if (ev.button !== 0) return;
  toNdc(ev as unknown as MouseEvent, canvas);
  const camera = world.camera?.three ?? world.camera;
  const hit = planner.intersectTable(pointerNdc, camera);
  if (!hit) return;
  planner.placeAt(hit);
});
