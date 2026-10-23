const DISMISS_KEYS = ['reviewView','reviewId','reviewEntityType','reviewTargetId','auditCaseId','sellerId','accreditedSellerId','reviewTab','paymentId','proofId','scheduleId'];
export const dismissReviewRecordQuery = (searchParams) => {
  const next = new URLSearchParams(searchParams);
  const id = Number(next.get('reviewId') || 0);
  for (const key of DISMISS_KEYS) next.delete(key);
  if (Number.isSafeInteger(id) && id > 0) next.set('reviewReturnId', String(id));
  return next;
};
export const reviewReturnPath = (role, id) => Number.isSafeInteger(Number(id)) && Number(id) > 0
  ? `/portal/${encodeURIComponent(role || 'super_admin')}/review-center/reviews/${Number(id)}` : null;

