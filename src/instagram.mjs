// Backward-compatible facade for existing callers and the preserved Instagram session.
import { readSocialStatus, writeSocialStatus, startSocialTask, socialActiveStatuses } from './social.mjs';
export const readInstagramStatus = dataDir => readSocialStatus(dataDir, 'instagram');
export const writeInstagramStatus = (dataDir, status) => writeSocialStatus(dataDir, 'instagram', status);
export const startInstagramTask = (dataDir, input) => startSocialTask(dataDir, { ...input, channel:'instagram' });
export const instagramActiveStatuses = socialActiveStatuses;
