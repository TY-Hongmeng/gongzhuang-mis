// Error Handling
export {
  errorHandler,
  handleError,
  handleApiError,
  handleValidationError,
  handleSuccess,
  handleWarning,
  handleInfo,
  ErrorLevel,
  ErrorHandlerOptions
} from './errorHandler'

// Price Calculator
export {
  getApplicableMaterialPrice,
  calculateTotalPrice
} from './priceCalculator'

// Production Format
export {
  formatSpecificationsForProduction,
  parseProductionSpecifications
} from './productionFormat'

// Production Hint
export {
  getProductionFormatHint
} from './productionHint'

// Re-export everything as default for backward compatibility
import * as errorHandlerModule from './errorHandler'
import * as priceCalculatorModule from './priceCalculator'
import * as productionFormatModule from './productionFormat'
import * as productionHintModule from './productionHint'

export default {
  // Error handling
  ...errorHandlerModule,
  
  // Price calculator
  ...priceCalculatorModule,
  
  // Production format
  ...productionFormatModule,
  
  // Production hint
  ...productionHintModule
}