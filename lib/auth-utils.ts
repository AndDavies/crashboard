import { supabase } from "./supabase"

export async function isAuthenticated(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return !!session
  } catch (error) {
    console.error("Error checking authentication:", error)
    return false
  }
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut()
    window.location.href = "/sign-in"
  } catch (error) {
    console.error("Error signing out:", error)
  }
}

