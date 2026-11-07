import { createContext } from 'react'

// Context nesnesi ayrı dosyada: AuthContext.jsx yalnızca bileşen dışa aktarsın (lint kuralı)
export const AuthContext = createContext(null)
