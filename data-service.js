(function () {
  const config = window.CANCIONERO_CONFIG || {};
  const configured =
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    !config.supabaseUrl.includes("PEGA_AQUI") &&
    !config.supabaseAnonKey.includes("PEGA_AQUI") &&
    window.supabase;

  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;

  function normalizeSong(row) {
    return {
      id: row.id,
      numero: String(row.numero ?? "").padStart(2, "0"),
      titulo: row.titulo ?? "",
      letra: row.letra ?? "",
      youtube: row.youtube ?? "",
      inicio: Number(row.inicio) || 0,
      categoria: row.categoria ?? "",
      orden: Number(row.orden) || Number(row.numero) || 0,
      destacada: Boolean(row.destacada)
    };
  }

  async function listSongs() {
    if (!client) {
      return (window.CANCIONES_INICIALES || []).map(normalizeSong);
    }

    const { data, error } = await client
      .from("canciones")
      .select("*")
      .order("orden", { ascending: true })
      .order("numero", { ascending: true });

    if (error) throw error;
    return data.map(normalizeSong);
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Primero configura Supabase en config.js.");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function saveSong(song) {
    if (!client) throw new Error("Primero configura Supabase en config.js.");
    const payload = {
      numero: String(song.numero).trim(),
      titulo: String(song.titulo).trim(),
      letra: String(song.letra).trim(),
      youtube: String(song.youtube || "").trim(),
      inicio: Math.max(0, Number(song.inicio) || 0),
      categoria: String(song.categoria || "").trim(),
      orden: Math.max(0, Number(song.orden) || Number(song.numero) || 0),
      destacada: Boolean(song.destacada),
      updated_at: new Date().toISOString()
    };

    const query = song.id
      ? client.from("canciones").update(payload).eq("id", song.id).select().single()
      : client.from("canciones").insert(payload).select().single();

    const { data, error } = await query;
    if (error) throw error;
    return normalizeSong(data);
  }

  async function deleteSong(id) {
    if (!client) throw new Error("Primero configura Supabase en config.js.");
    const { error } = await client.from("canciones").delete().eq("id", id);
    if (error) throw error;
  }

  async function importInitialSongs() {
    if (!client) throw new Error("Primero configura Supabase en config.js.");
    const initial = window.CANCIONES_INICIALES || [];
    if (!initial.length) throw new Error("No se encontraron canciones iniciales para importar.");

    const payload = initial.map((song, index) => ({
      numero: String(song.numero || index + 1).trim(),
      titulo: String(song.titulo || "").trim(),
      letra: String(song.letra || "").trim(),
      youtube: String(song.youtube || "").trim(),
      inicio: Math.max(0, Number(song.inicio) || 0),
      categoria: String(song.categoria || "").trim(),
      orden: Number(song.orden) || index + 1,
      destacada: Boolean(song.destacada)
    }));

    const { count, error: countError } = await client.from("canciones").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if (count > 0) throw new Error("La base ya contiene canciones. No se realizó la importación para evitar duplicados.");

    const { error } = await client.from("canciones").insert(payload);
    if (error) throw error;
    return payload.length;
  }

  window.CancioneroDB = {
    client,
    configured: Boolean(client),
    listSongs,
    getSession,
    signIn,
    signOut,
    saveSong,
    deleteSong,
    importInitialSongs
  };
})();
