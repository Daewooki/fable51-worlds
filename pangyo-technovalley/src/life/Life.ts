// Pedestrians, vehicles and traffic lights.
import type { Updatable } from '../app/App';
import type { World } from '../world/World';
import type { App } from '../app/App';
import type { Props } from '../world/Props';
import { Config } from '../app/Config';
import { Pedestrians } from './Pedestrians';
import { Traffic } from './Traffic';
import { TrafficLights } from './TrafficLights';

export class Life implements Updatable {
  frozen = false;
  pedestrians: Pedestrians | null = null;
  lights: TrafficLights | null = null;
  traffic: Traffic | null = null;
  constructor(public world: World, public app: App, public props: Props) {}
  async build() {
    try {
      this.pedestrians = new Pedestrians(this.world, this.app, { count: 220 });
      await this.pedestrians.build();
    } catch (e) { console.error('[life] pedestrians failed', e); this.pedestrians = null; }
    try {
      this.lights = new TrafficLights(this.world, this.app);
      this.traffic = new Traffic(this.world, this.app, this.props, this.lights, { count: 110 });
      await this.traffic.build();
      const nav = (this.pedestrians as any)?.nav; if (nav && this.lights) nav.lights = (x: number, z: number) => this.lights!.state(x, z);
    } catch (e) { console.error('[life] traffic failed', e); this.traffic = null; }
  }
  stats() { return { pedestrians: 0, vehicles: 0, ...(this.pedestrians ? this.pedestrians.stats() : {}), ...(this.traffic ? this.traffic.stats() : {}), ...(this.lights ? { lights: this.lights.stats() } : {}) }; }
  update(dt: number, t: number) {
    void t;
    if (this.frozen || Config.freeze) return;
    this.lights?.update(dt);
    this.pedestrians?.update(dt);
    this.traffic?.update(dt);
  }
}
