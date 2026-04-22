import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export interface AgoraTokens {
  channelName: string;
  customerToken: string;
  astrologerToken: string;
  expiresAt: Date;
}

export async function generateAgoraTokens(consultationId: string, durationMinutes: number): Promise<AgoraTokens> {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
    throw new AppError('AGORA_TOKEN_ERROR', 'Agora not configured.', 501);
  }

  const channelName = `call_${consultationId}`;
  const expirationSeconds = durationMinutes * 60 + 60;
  const privilegeExpireTs = Math.floor(Date.now() / 1000) + expirationSeconds;

  const customerToken = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    0,
    RtcRole.PUBLISHER,
    privilegeExpireTs,
  );

  const astrologerToken = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channelName,
    0,
    RtcRole.PUBLISHER,
    privilegeExpireTs,
  );

  return {
    channelName,
    customerToken,
    astrologerToken,
    expiresAt: new Date(privilegeExpireTs * 1000),
  };
}
