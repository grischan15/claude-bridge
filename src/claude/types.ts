export interface RateLimitInfo {
  status: string
  resetsAt: number
  rateLimitType: string
  overageStatus: string
  overageDisabledReason: string | null
  isUsingOverage: boolean
}

export type BridgeEvent =
  | { type: 'delta'; blockType: 'thinking' | 'text'; text: string }
  | { type: 'rate_limit'; info: RateLimitInfo }
  | { type: 'result'; text: string; isError: boolean; totalCostUsd: number; sessionId: string; stopReason: string }
  | { type: 'error'; message: string }
