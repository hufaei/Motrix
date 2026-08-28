const TASK_ERROR_GUIDES = {
  13: 'file-exists'
}

function normalizeText (value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

export function hasTaskError (task = {}) {
  const errorCode = normalizeText(task.errorCode)
  return errorCode !== '' && errorCode !== '0'
}

export function getTaskErrorPresentation (task = {}, translate) {
  const errorCode = normalizeText(task.errorCode)
  const errorMessage = normalizeText(task.errorMessage)
  const guide = TASK_ERROR_GUIDES[errorCode]
  const reason = guide
    ? translate(`task.download-error-${guide}-reason`)
    : errorMessage || translate('task.download-error-unknown-reason')
  const suggestion = guide
    ? translate(`task.download-error-${guide}-suggestion`)
    : translate('task.download-error-generic-suggestion')
  const codeLabel = errorCode
    ? translate('task.download-error-code', { errorCode })
    : ''
  const reasonWithCode = [reason, codeLabel].filter(Boolean).join(' · ')
  const original = guide && errorMessage
    ? translate('task.download-error-original', { errorMessage })
    : ''

  return {
    errorCode,
    errorMessage,
    reason,
    suggestion,
    reasonWithCode,
    original,
    summary: [reasonWithCode, suggestion].filter(Boolean).join('\n'),
    detail: [reasonWithCode, suggestion, original].filter(Boolean).join('\n')
  }
}
