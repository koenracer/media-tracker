import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://luszqsbdmztwfjihhttw.supabase.co'
const supabaseKey = 'sb_publishable_XRbDSodo9faUJ4MBPdyKug_vmyjp7j7'

export const supabase = createClient(supabaseUrl, supabaseKey)