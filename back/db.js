//
// Clément Augustinowick
//

import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY

if (!url || !key){
    throw new Error("Variables d'environnement Supabase manquantes.");
}

const supabase = createClient(url, key, { auth: {persistSession: false} });

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createTournament(state){
    const { data, error } = await supabase
        .from("tournaments")
        .insert({ state })
        .select("id")
        .single();
    
    if (error){
        throw new Error(error.message);
    }

    return data.id;
}

export async function getTournamentState(id){
    if (!UUID_REGEX.test(String(id))){
        throw new Error("Tournois introuvable!.")
    }

    const { data, error } = await supabase
        .from("tournaments")
        .select("state")
        .eq("id", id)
        .maybeSingle()
    
    if (error){
        throw new Error(error.message);
    }

    if (!data){
        throw new Error("Tournois introuvable.");
    }

    return data.state;
}

export async function saveTournamentState(id, state){
    const { error } = await supabase
        .from("tournaments")
        .update({ state, updated_at: new Date().toISOString() })
        .eq("id", id)
    
    if (error){
        throw new Error(error.message);
    }
}
