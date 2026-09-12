import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/Common/ErrorBoundary'
import { TableDensityProvider } from './context/TableDensityContext'
import {
  applyLogTypographyToDocument,
  LOG_FONT_FAMILIES,
  DEFAULT_LOG_FONT_SIZE,
  MIN_LOG_FONT_SIZE,
  MAX_LOG_FONT_SIZE,
} from './hooks/useLogTypography'

// Hydrate log typography CSS variables before render
try {
  const savedFont = localStorage.getItem('kermitt_log_font_family');
  const savedSize = localStorage.getItem('kermitt_log_font_size');
  const fontOption = LOG_FONT_FAMILIES.find((f) => f.id === savedFont) || LOG_FONT_FAMILIES[0];
  const size = savedSize ? Math.min(MAX_LOG_FONT_SIZE, Math.max(MIN_LOG_FONT_SIZE, parseInt(savedSize, 10))) : DEFAULT_LOG_FONT_SIZE;
  applyLogTypographyToDocument(fontOption.fontFamily, size);
} catch {}

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <ErrorBoundary fallbackTitle="Application Crash Isolated">
            <TableDensityProvider>
                <App/>
            </TableDensityProvider>
        </ErrorBoundary>
    </React.StrictMode>
)
