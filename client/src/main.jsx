import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import './styles/index.css'

// After a deploy, a tab opened earlier asks for page files from the old build,
// which no longer exist; reload once to pick up the new build. At most once
// every 10 seconds, so a missing file or a down server can't cause a reload loop
window.addEventListener('vite:preloadError', (event) => {
    try {
        const lastReload = Number(sessionStorage.getItem('chunkReloadAt')) || 0
        if (Date.now() - lastReload < 10000) return
        sessionStorage.setItem('chunkReloadAt', String(Date.now()))
    } catch {
        return // no storage to guard the reload with
    }
    event.preventDefault()
    window.location.reload()
})

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ThemeProvider>
                    <AuthProvider>
                        <App />
                        <Toaster
                            position="top-right"
                            toastOptions={{
                                duration: 3000,
                                style: {
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                },
                            }}
                        />
                    </AuthProvider>
                </ThemeProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>,
)
