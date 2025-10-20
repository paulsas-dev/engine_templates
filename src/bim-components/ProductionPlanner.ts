import * as THREE from "three";
import type { World } from "@thatopen/components";

export type PlannerOptions = {
  tableSize?: {
    width: number;
    depth: number;
    height: number;
    thickness?: number;
  };
  leg?: { size?: number; inset?: number };
  colors?: { top?: number; legs?: number };
  snap?: number | null;
};

export class ProductionPlanner {
  public readonly root = new THREE.Group();
  public readonly tableGroup = new THREE.Group();
  public readonly tableTop: THREE.Mesh;
  public readonly legs: THREE.Mesh[] = [];
  public readonly world: World;

  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpBox = new THREE.Box3();
  private readonly tmpSize = new THREE.Vector3();
  private readonly tmpV3 = new THREE.Vector3();
  private readonly tableTopBox = new THREE.Box3();

  private placeablePrototype: THREE.Object3D | null = null;
  private readonly snap: number | null;

  constructor(world: World, opts: PlannerOptions = {}) {
    this.world = world;

    const width = opts.tableSize?.width ?? 2.0;
    const depth = opts.tableSize?.depth ?? 1.0;
    const height = opts.tableSize?.height ?? 0.75;
    const thickness = opts.tableSize?.thickness ?? 0.05;

    const legSize = opts.leg?.size ?? 0.05;
    const legInset = opts.leg?.inset ?? 0.06;

    const colorTop = opts.colors?.top ?? 0x7a7a7a;
    const colorLegs = opts.colors?.legs ?? 0x9a9a9a;

    // Tischplatte
    const topGeo = new THREE.BoxGeometry(width, thickness, depth);
    const topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorTop),
      metalness: 0.1,
      roughness: 0.8,
    });
    this.tableTop = new THREE.Mesh(topGeo, topMat);
    this.tableTop.name = "table-top";
    this.tableTop.position.set(0, height, 0);
    this.tableTop.receiveShadow = true;

    // Beine
    const legHeight = height - 0.01;
    const legGeo = new THREE.BoxGeometry(legSize, legHeight, legSize);
    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorLegs),
      metalness: 0.1,
      roughness: 0.8,
    });

    const halfW = width / 2;
    const halfD = depth / 2;
    const legY = legHeight / 2;

    const legPositions: [number, number, number][] = [
      [halfW - legInset, legY, halfD - legInset],
      [-halfW + legInset, legY, halfD - legInset],
      [halfW - legInset, legY, -halfD + legInset],
      [-halfW + legInset, legY, -halfD + legInset],
    ];

    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.name = `table-leg-${i + 1}`;
      leg.position.set(
        legPositions[i][0],
        legPositions[i][1],
        legPositions[i][2],
      );
      leg.castShadow = true;
      leg.receiveShadow = true;
      this.legs.push(leg);
      this.tableGroup.add(leg);
    }

    this.tableGroup.name = "table";
    this.tableGroup.add(this.tableTop);
    this.root.name = "ProductionPlannerRoot";
    this.root.add(this.tableGroup);

    // Bounding-Box nur der Tischplatte (für Clamping)
    this.tableTop.updateWorldMatrix(true, true);
    this.tableTopBox.setFromObject(this.tableTop);

    this.snap = opts.snap ?? null;
  }

  mount() {
    this.world.scene.three.add(this.root);
  }

  setPlaceablePrototype(obj: THREE.Object3D | null) {
    this.placeablePrototype = obj;
  }

  intersectTable(
    pointerNdc: THREE.Vector2,
    camera: THREE.Camera,
  ): THREE.Vector3 | null {
    this.raycaster.setFromCamera(pointerNdc, camera);
    const hit = this.raycaster.intersectObject(this.tableTop, true)[0];
    return hit ? hit.point.clone() : null;
  }

  private makeInstance(): THREE.Object3D {
    if (this.placeablePrototype) return this.placeablePrototype.clone(true);
    const g = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.3 });
    const cube = new THREE.Mesh(g, m);
    cube.name = "planner-demo-cube";
    cube.castShadow = true;
    return cube;
  }

  placeAt(hitPoint: THREE.Vector3): THREE.Object3D {
    const inst = this.makeInstance();
    inst.updateWorldMatrix(true, true);

    const tableTopY = this.tableTopBox.max.y;

    this.tmpV3.set(hitPoint.x, tableTopY + 0.001, hitPoint.z);
    if (typeof this.snap === "number" && this.snap > 0) {
      this.tmpV3.x = Math.round(this.tmpV3.x / this.snap) * this.snap;
      this.tmpV3.z = Math.round(this.tmpV3.z / this.snap) * this.snap;
    }

    this.root.add(inst);
    inst.position.copy(this.tmpV3);
    inst.updateWorldMatrix(true, true);

    this.tmpBox.setFromObject(inst);
    this.tmpBox.getSize(this.tmpSize);
    const marginX = this.tmpSize.x * 0.5;
    const marginZ = this.tmpSize.z * 0.5;

    const minX = this.tableTopBox.min.x + marginX;
    const maxX = this.tableTopBox.max.x - marginX;
    const minZ = this.tableTopBox.min.z + marginZ;
    const maxZ = this.tableTopBox.max.z - marginZ;

    const clampedX = Math.min(Math.max(inst.position.x, minX), maxX);
    const clampedZ = Math.min(Math.max(inst.position.z, minZ), maxZ);

    if (typeof this.snap === "number" && this.snap > 0) {
      inst.position.set(
        Math.min(
          Math.max(Math.round(clampedX / this.snap) * this.snap, minX),
          maxX,
        ),
        tableTopY + 0.001,
        Math.min(
          Math.max(Math.round(clampedZ / this.snap) * this.snap, minZ),
          maxZ,
        ),
      );
    } else {
      inst.position.set(clampedX, tableTopY + 0.001, clampedZ);
    }

    inst.updateWorldMatrix(true, true);
    return inst;
  }
}
