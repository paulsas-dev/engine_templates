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
  private readonly epsilon = 0.0005;

  private width: number;
  private depth: number;
  private height: number;
  private thickness: number;

  // Mathematische Ebene (kein renderbares Mesh) – verhindert Z-Fighting
  private surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tableTopY = 0;

  constructor(world: World, opts: PlannerOptions = {}) {
    this.world = world;

    this.width = opts.tableSize?.width ?? 2.0;
    this.depth = opts.tableSize?.depth ?? 1.0;
    this.height = opts.tableSize?.height ?? 0.75;
    this.thickness = opts.tableSize?.thickness ?? 0.05;

    const legSize = opts.leg?.size ?? 0.05;
    const legInset = opts.leg?.inset ?? 0.06;

    const colorTop = opts.colors?.top ?? 0x7a7a7a;
    const colorLegs = opts.colors?.legs ?? 0x9a9a9a;

    // Tischplatte
    const topGeo = new THREE.BoxGeometry(
      this.width,
      this.thickness,
      this.depth,
    );
    const topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorTop),
      metalness: 0.1,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.tableTop = new THREE.Mesh(topGeo, topMat);
    this.tableTop.name = "table-top";
    this.tableTop.position.set(0, this.height, 0);
    this.tableTop.receiveShadow = true;

    // Beine
    const legHeight = this.height - 0.01;
    const legGeo = new THREE.BoxGeometry(legSize, legHeight, legSize);
    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorLegs),
      metalness: 0.1,
      roughness: 0.8,
    });

    const halfW = this.width / 2;
    const halfD = this.depth / 2;
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

    // Bounds initialisieren
    this.updateTableBounds();

    this.snap = opts.snap ?? null;
  }

  /** Nach Transformationsänderungen des Tisches aufrufen */
  public updateTableBounds(): void {
    this.tableTop.updateWorldMatrix(true, true);
    this.tableTopBox.setFromObject(this.tableTop);
    this.tableTopY = this.tableTopBox.max.y;
    this.surfacePlane.set(new THREE.Vector3(0, 1, 0), -this.tableTopY);
  }

  public mount(): void {
    this.world.scene.three.add(this.root);
    this.updateTableBounds();
  }

  public setPlaceablePrototype(obj: THREE.Object3D | null): void {
    this.placeablePrototype = obj;
  }

  /** Raycast gegen die mathematische Ebene; nur Punkte innerhalb der Platte */
  public intersectTable(
    pointerNdc: THREE.Vector2,
    camera: THREE.Camera,
  ): THREE.Vector3 | null {
    this.raycaster.setFromCamera(pointerNdc, camera);
    const out = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.surfacePlane, out);
    if (!hit) return null;

    const withinX =
      hit.x >= this.tableTopBox.min.x && hit.x <= this.tableTopBox.max.x;
    const withinZ =
      hit.z >= this.tableTopBox.min.z && hit.z <= this.tableTopBox.max.z;
    if (!withinX || !withinZ) return null;

    return hit.clone();
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

  /** Platziert ein Objekt auf der Tischoberfläche und klemmt es innerhalb der Platte */
  public placeAt(hitPoint: THREE.Vector3): THREE.Object3D {
    this.updateTableBounds();

    const inst = this.makeInstance();
    this.root.add(inst);

    inst.updateWorldMatrix(true, true);
    this.tmpBox.setFromObject(inst);
    this.tmpBox.getSize(this.tmpSize);

    const halfH = this.tmpSize.y * 0.5;

    this.tmpV3.set(
      hitPoint.x,
      this.tableTopY + halfH + this.epsilon,
      hitPoint.z,
    );

    if (typeof this.snap === "number" && this.snap > 0) {
      this.tmpV3.x = Math.round(this.tmpV3.x / this.snap) * this.snap;
      this.tmpV3.z = Math.round(this.tmpV3.z / this.snap) * this.snap;
    }

    const marginX = this.tmpSize.x * 0.5;
    const marginZ = this.tmpSize.z * 0.5;

    const minX = this.tableTopBox.min.x + marginX;
    const maxX = this.tableTopBox.max.x - marginX;
    const minZ = this.tableTopBox.min.z + marginZ;
    const maxZ = this.tableTopBox.max.z - marginZ;

    const clampedX = Math.min(Math.max(this.tmpV3.x, minX), maxX);
    const clampedZ = Math.min(Math.max(this.tmpV3.z, minZ), maxZ);

    if (typeof this.snap === "number" && this.snap > 0) {
      inst.position.set(
        Math.min(
          Math.max(Math.round(clampedX / this.snap) * this.snap, minX),
          maxX,
        ),
        this.tableTopY + halfH + this.epsilon,
        Math.min(
          Math.max(Math.round(clampedZ / this.snap) * this.snap, minZ),
          maxZ,
        ),
      );
    } else {
      inst.position.set(
        clampedX,
        this.tableTopY + halfH + this.epsilon,
        clampedZ,
      );
    }

    inst.updateWorldMatrix(true, true);
    return inst;
  }
}
