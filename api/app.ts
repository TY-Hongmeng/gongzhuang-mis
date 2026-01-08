/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import toolingRoutes from './routes/tooling.js'
import optionsRoutes from './routes/options.js'
import materialsRoutes from './routes/materials.js'
import partTypesRoutes from './routes/partTypes.js'
import diagnosticsRoutes from './routes/diagnostics.js'
import usersRoutes from './routes/users.js'
import cuttingOrdersRoutes from './routes/cuttingOrders.js'
import purchaseOrdersRoutes from './routes/purchaseOrders.js'
import backupMaterialsRoutes from './routes/backupMaterials.js'
import manualPlansRoutes from './routes/manualPlans.js'
import permissionsRoutes from './routes/permissions.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:3000', 'http://localhost:5182', 'http://localhost:5183', 'http://localhost:5184', 'http://localhost:5185', 'http://localhost:5186', 'http://localhost:5187', 'http://localhost:5188', 'http://localhost:5190', 'http://localhost:5191'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/tooling', toolingRoutes)
app.use('/api/options', optionsRoutes)
app.use('/api/materials', materialsRoutes)
app.use('/api/part-types', partTypesRoutes)
app.use('/api/diagnostics', diagnosticsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/cutting-orders', cuttingOrdersRoutes)
app.use('/api/purchase-orders', purchaseOrdersRoutes)
app.use('/api/backup-materials', backupMaterialsRoutes)
app.use('/api/manual-plans', manualPlansRoutes)
app.use('/api/permissions', permissionsRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler caught:', error)
  res.status(503).json({
    success: false,
    error: '服务不可用了',
    details: error?.message || '未知错误',
    stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
