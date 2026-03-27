import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { WithLoggerContext } from '@yikart/common'
import { Redlock } from '@yikart/redlock'
import { RedlockKey } from '../../common/enums'
import { config } from '../../config'
import { AgentService } from './agent.service'

@Injectable()
export class AgentTaskTimeoutScheduler {
  private readonly logger = new Logger(AgentTaskTimeoutScheduler.name)

  constructor(private readonly agentService: AgentService) { }

  /**
   * 每10分钟检查一次超时的 running 任务
   * 将超过配置的超时时间未更新的 running 任务更新为 error 状态
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  @Redlock(RedlockKey.AgentTaskTimeout, 600, { throwOnFailure: false })
  @WithLoggerContext()
  async recoverTimeoutRunningTasks() {
    const timeoutMs = config.agent.taskTimeoutMs
    this.logger.debug(
      `Start checking timed-out running tasks (timeout: ${timeoutMs}ms, ~${Math.round(timeoutMs / 1000 / 60)} minutes)`,
    )

    const result
      = await this.agentService.recoverTimeoutRunningTasks(timeoutMs)
    if (result.updatedCount > 0) {
      this.logger.debug(
        `Successfully updated ${result.updatedCount} timed-out task(s) to error status`,
      )
    }
  }
}
