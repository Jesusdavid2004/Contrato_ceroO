export interface AIUsageRepository {
  reserveDailyAnalysis(
    userId: string,
    dailyLimit: number,
    dayStart: Date,
    createdAt: Date,
  ): Promise<boolean>;
  recordUsage(
    userId: string,
    model: string,
    tokensUsed: number,
    operation: string,
    latencyMs: number,
    createdAt: Date,
  ): Promise<void>;
}
