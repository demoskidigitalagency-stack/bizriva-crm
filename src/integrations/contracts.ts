export type ProviderHealth = "connected" | "warning" | "expired" | "failed" | "disconnected";

export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
}

export interface MessagingInboundEvent {
  provider: string;
  externalEventId: string;
  channel: "whatsapp" | "instagram" | "facebook" | "tiktok" | "email" | "sms" | "webchat";
  externalContactId: string;
  phone?: string;
  email?: string;
  displayName?: string;
  messageId: string;
  threadId?: string;
  body: string;
  receivedAt: string;
  raw?: unknown;
}

export interface MessagingProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  sendText(input: { to: string; body: string; templateId?: string }): Promise<ProviderResult<{ externalMessageId: string }>>;
  normalizeInbound(payload: unknown): Promise<ProviderResult<MessagingInboundEvent[]>>;
}

export interface PaymentProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  createCheckout(input: { orderId: string; amountMinor: number; currency: string; email?: string }): Promise<ProviderResult<{ reference: string; checkoutUrl?: string }>>;
  verify(reference: string): Promise<ProviderResult<{ paid: boolean; amountMinor: number; currency: string }>>;
}

export interface AdsProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  sync(range: { from: string; to: string }): Promise<ProviderResult<{ campaigns: number; metricsRows: number }>>;
}

export interface CommerceProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  syncOrders(cursor?: string): Promise<ProviderResult<{ imported: number; nextCursor?: string }>>;
  syncProducts(cursor?: string): Promise<ProviderResult<{ imported: number; nextCursor?: string }>>;
}

export interface LogisticsProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  createShipment(input: { orderId: string; address: Record<string,string>; amountMinor?: number; currency?: string }): Promise<ProviderResult<{ trackingRef: string }>>;
  track(trackingRef: string): Promise<ProviderResult<{ status: string; occurredAt: string }>>;
}

export interface AIProvider {
  id: string;
  health(): Promise<ProviderHealth>;
  respond(input: { system: string; messages: { role: "user" | "assistant"; content: string }[] }): Promise<ProviderResult<{ text: string; confidence?: number }>>;
}

export interface IntegrationRegistry {
  messaging: Record<string, MessagingProvider>;
  payments: Record<string, PaymentProvider>;
  ads: Record<string, AdsProvider>;
  commerce: Record<string, CommerceProvider>;
  logistics: Record<string, LogisticsProvider>;
  ai: Record<string, AIProvider>;
}
