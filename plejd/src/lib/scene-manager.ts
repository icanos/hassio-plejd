import { getLogger } from '@/lib/logger';
import type { DeviceRegistry } from '@/lib/device-registry';
import type { PlejdBleHandler } from '@/lib/plejd-ble-handler';

const logger = getLogger('scene-manager');

export class SceneManager {
  constructor(
    private readonly deviceRegistry: DeviceRegistry,
    private readonly bleHandler: PlejdBleHandler
  ) {}

  public init(): void {
    logger.info('Scene manager initialized');
  }

  public executeScene(sceneId: string): void {
    const scene = this.deviceRegistry.getAllScenes().find(s => s.uniqueId === sceneId);
    
    if (!scene) {
      logger.warn(`Scene ${sceneId} not found`);
      return;
    }

    logger.info(`Executing scene: ${scene.name} (${sceneId})`);
    
    // Trigger scene via BLE
    void this.bleHandler.triggerScene(scene.bleOutputAddress);
  }
}