enum Messages {
  AlertSet = '✅ Alert set for %s.',
  AlertDeleted = '✅ Alert has been deleted successfully.',
  Alert = '🚨 %s is now %s %f at %f.',
  ConnectionStatusChanged = '🔗 Connection with Kraken is now changed to %s.',
  NoAlerts = '😐 No alerts have been set up.',
  NoPairsFound = '😐 No pairs found.',
  ErrorFailedToFetchPrice = '❌ Failed to fetch current price in order to set alert.',
  ErrorPricesAreEqual = '❌ Failed to set alert because target price is equal to current price.',
  ErrorAlertAlreadyExists = '❌ Failed to set alert as alert already exists.',
  ErrorDeletingAlertNotFound = '❌ Failed to delete alert as alert cannot be found.',
  ErrorPairNotFound = '❌ Failed to set alert as pair is not supported. Use /pair command to view supported pairs.',
}

export default Messages;
