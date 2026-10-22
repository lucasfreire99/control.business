/* Configuração do modo online (Supabase).
   Deixe os dois campos vazios para usar o sistema só no navegador (modo local).
   Para ligar o modo online, copie os valores em: Supabase > Project Settings > API
   (a "anon public key" foi feita para ficar no site; quem protege os dados são as regras do banco). */
window.APP_CONFIG = {
  SUPABASE_URL: '',       // ex.: 'https://abcdefghijk.supabase.co'
  SUPABASE_ANON_KEY: '',  // ex.: 'eyJhbGciOi...'
};
