import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://luszqsbdmztwfjihhttw.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_XRbDSodo9faUJ4MBPdyKug_vmyjp7j7'

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)