import type { Source } from '../sources/base.js'
import type { Destination } from '../destinations/base.js'
import type { UnifiedMessage } from './types.js'

/** Маршрут доставки: из блока-источника в блок-назначение. */
export interface Route {
  from: string // Source.id
  to: string // Destination.id
}

/**
 * Ядро: подписывается на все источники и разводит входящие сообщения по
 * назначениям согласно маршрутам. Ошибка доставки в одно назначение не роняет
 * остальные.
 */
export class Pipeline {
  constructor(
    private readonly sources: Source[],
    private readonly destinations: Destination[],
    private readonly routes: Route[],
  ) {}

  async start(): Promise<void> {
    for (const source of this.sources) {
      // Запускаем источники параллельно — каждый крутит свой цикл опроса.
      void source.start((msg) => this.dispatch(source.id, msg))
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.sources.map((s) => s.stop()))
  }

  private async dispatch(sourceId: string, msg: UnifiedMessage): Promise<void> {
    const targets = this.routes
      .filter((r) => r.from === sourceId)
      .map((r) => this.destinations.find((d) => d.id === r.to))
      .filter((d): d is Destination => Boolean(d))

    const preview = msg.text.replace(/\s+/g, ' ').slice(0, 60)
    console.log(`[pipeline] ${sourceId} → ${targets.length} назнач.: "${preview}"`)

    await Promise.all(
      targets.map((dest) =>
        dest.send(msg).catch((err: Error) =>
          console.error(`[pipeline] доставка в ${dest.id} упала:`, err.message),
        ),
      ),
    )
  }
}
