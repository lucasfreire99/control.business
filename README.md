# Controle de Documentação

Sistema web para conferir, mês a mês, a documentação exigida de cada empresa (por exemplo, para envio à Bernhoeft). **Não cadastra funcionários**: o controle é por empresa e por mês, com um checklist fixo de 11 documentos. É um site estático (**HTML, CSS e JavaScript**) com exportação para **Excel**.

Ele roda em **dois modos**:

| Modo | Onde ficam os dados | Login e equipe | Quando usar |
|---|---|---|---|
| **Local** (padrão) | No navegador (`localStorage`) | Não | Teste, uso individual |
| **Online** (Supabase) | Banco Postgres gratuito na nuvem | Sim, com perfis | Uso real, em equipe, de qualquer computador |

O modo online liga sozinho quando você preenche `js/config.js` (passo a passo abaixo). Sem isso, tudo funciona como modo local.

## O que ele faz

O checklist é fixo e igual para todas as empresas:

- **Documentação da empresa exigida para Bernhoeft – mensal (8):** Acordo/Convenção coletiva; Declaração de subcontratação e quitação; FOPAG analítica + bases de INSS e FGTS; DARF pago + DCTFWeb + CND Federal; GFD (Guia do FGTS Digital); FOPAG de autônomos e sócios; Recolhimento do INSS; Certidão Negativa de Débitos federais.
- **Documentação do colaborador – mensal (3):** Cartão de ponto com horas extras e/ou noturnas; Comprovante de pagamento de salários; Acordo individual de banco de horas.

Telas:

- **Painel:** indicadores do mês, situação por empresa e pendências.
- **Empresas:** cadastro com CNPJ validado, mês de início do controle e opção de inativar.
- **Conferência:** todas as empresas nas linhas e os 11 documentos nas colunas, para o mês escolhido. Cada célula é OK, PENDENTE ou N/A, e o botão "Tudo OK" marca de uma vez o que estiver pendente.
- **Ficha:** uma empresa em um mês, com nome completo do documento, status e um campo de observação grande (várias linhas).
- **Matriz anual:** uma empresa, 12 meses nas colunas, com % concluído e pendências por mês.
- **Relatórios em Excel (.xlsx):** conferência do mês, checklist da empresa, matriz anual, pendências, resumo anual e dados completos.
- **Cobrança:** escolha a empresa e o mês de competência e o sistema monta a mensagem com os documentos pendentes. Para e-mail há copiar mensagem, copiar assunto e abrir no programa de e-mail; para WhatsApp há enviar (abre o WhatsApp com o texto pronto) e copiar. Os textos são editáveis antes de enviar. O e-mail e o WhatsApp da empresa são cadastrados em Empresas.
- **Equipe (modo online):** convite por código e perfis Administrador, Editor e Consulta.
- **Configurações:** backup e restauração em JSON e histórico de alterações.
- **Instalar como app:** botão "Instalar app" no menu lateral (Chrome, Edge, Android e iPhone). O app abre em janela própria, com ícone no computador ou no celular.

Regras automáticas: meses antes do início do controle da empresa aparecem como "-" e não contam como pendência, meses passados e o atual nascem PENDENTE, e meses futuros ficam em branco.

> Quem usou a versão anterior (com funcionários) não perde as empresas: ao abrir, elas são convertidas para o novo formato. Os registros por funcionário não são aproveitados.

---

## 1. Rodar no seu computador (modo local)

**Opção 1:** baixe ou clone o projeto e dê dois cliques em `index.html` (Chrome, Edge ou Firefox). Não precisa de internet nem de instalação.

**Opção 2:** servidor local, se o navegador bloquear algo ao abrir por `file://`:

```bash
python3 -m http.server 8000   # dentro da pasta do projeto, depois abra http://localhost:8000
```

## 2. Publicar no GitHub Pages

1. Crie um repositório em [github.com](https://github.com) (**New repository**).
2. Envie o **conteúdo** da pasta do projeto, com o `index.html` na raiz do repositório. Pelo navegador (**uploading an existing file**) ou pelo terminal:

   ```bash
   git init && git add . && git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO.git
   git push -u origin main
   ```

3. Vá em **Settings → Pages**, em **Build and deployment** escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e **Save**.
4. Em 1 a 2 minutos o site abre em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Para atualizar, edite os arquivos e faça novo `git push`: o site é republicado sozinho.

## 3. Ligar o modo online com banco de dados gratuito (Supabase)

O [Supabase](https://supabase.com) oferece Postgres, login e API no plano gratuito. Limites do plano gratuito (conferidos na [documentação oficial](https://supabase.com/docs/pricing); podem mudar): 500 MB de banco por projeto, 50.000 usuários ativos por mês, 2 projetos e **pausa do projeto após 1 semana sem uso**.

### 3.1 Criar o projeto

1. Crie uma conta em supabase.com e clique em **New project**.
2. Escolha um nome, defina uma senha do banco (guarde-a) e, em **Region**, prefira **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto (alguns minutos).

### 3.2 Criar as tabelas e as regras de acesso

1. No menu do projeto, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**, cole no editor e clique em **Run**.
3. Deve aparecer "Success". Pode rodar de novo sem problema.

Isso cria as tabelas de equipe e de dados, liga a segurança por linha (RLS) e as funções que gravam com checagem de perfil e de versão.

### 3.3 Configurar o login

1. Vá em **Authentication → Sign In / Providers** (o nome do menu pode variar um pouco) e confirme que **Email** está habilitado.
2. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do seu GitHub Pages (`https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`) e adicione o mesmo endereço em **Redirect URLs**. Sem isso, o link de confirmação de e-mail e o de "esqueci a senha" voltam para o lugar errado.
3. Por padrão, quem cria conta precisa **confirmar o e-mail**. O envio de e-mails do plano gratuito é limitado, então, para equipes pequenas, você pode desligar **Confirm email** nas configurações do provedor Email. Se mantiver ligado, avise as pessoas para conferir a caixa de spam.

### 3.4 Copiar a URL e a chave para o site

1. Vá em **Project Settings → API** (ou **API Keys**).
2. Copie a **Project URL** e a chave pública (**anon public** ou **publishable**).
3. Cole em `js/config.js`:

   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
     SUPABASE_ANON_KEY: 'sua-chave-publica',
   };
   ```

4. Faça `git push` (ou envie o arquivo pelo GitHub). Em 1 minuto o site online passa a pedir login.

> A chave **anon/publishable** foi feita para ficar no site: quem protege os dados são as regras do banco (RLS). **Nunca** coloque a chave **service_role** (ou "secret") em nenhum arquivo deste projeto.

### 3.5 Primeiro acesso

1. Abra o site, clique em **Criar conta** e entre.
2. Escolha **Criar uma equipe nova**. Se você já usava o modo local neste navegador, escolha **Levar os dados deste navegador** para subir tudo para a nuvem.
3. Em **Equipe**, copie o **código de convite** e envie para os colegas. Eles criam conta, escolhem **Entrar na equipe** e digitam o código. Entram como **Editor**; você muda o perfil na mesma tela.

Perfis: **Administrador** gerencia a equipe e altera dados; **Editor** altera dados; **Consulta** só visualiza e exporta Excel.

### 3.6 Como a sincronização funciona

- Cada alteração é salva sozinha em cerca de 1 segundo. O menu lateral mostra "Tudo salvo" ou "Salvando…".
- Se duas pessoas editam ao mesmo tempo, o sistema **mescla** as alterações. Se as duas mudarem **o mesmo item**, vale a versão de quem salvou primeiro, e um aviso aparece.
- A cada 20 segundos (e ao voltar para a aba), o site busca alterações de outras pessoas e atualiza a tela. Isso só acontece se você não tiver alteração pendente e nenhuma janela aberta.
- Os dados da equipe ficam em um único documento versionado. Isso funciona bem para algumas centenas de empresas. Para volumes muito maiores, o caminho é normalizar em tabelas.

### 3.7 Evitar a pausa por inatividade (opcional)

Projetos gratuitos pausam após 1 semana sem uso; se acontecer, é só abrir o painel do Supabase e clicar em **Restore**. Para reduzir o risco, o projeto traz `.github/workflows/keepalive.yml`, que faz uma chamada leve ao banco a cada 3 dias:

1. No GitHub, vá em **Settings → Secrets and variables → Actions → New repository secret**.
2. Crie `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os mesmos valores do `js/config.js`.
3. Em **Actions**, rode o fluxo **Manter o Supabase ativo** uma vez para testar.

Não há garantia de que isso evite a pausa. O GitHub também desativa agendamentos de repositórios públicos sem atividade por 60 dias.

---

## Instalar como app

O site é um PWA. Depois de publicado no GitHub Pages (https), abra-o e clique em **Instalar app** no menu lateral, ou use o ícone de instalar na barra de endereço do Chrome/Edge. No iPhone, use o Safari → Compartilhar → **Adicionar à Tela de Início**.

- O app abre em janela própria. Sem internet ele abre a tela, mas **os dados do modo online precisam de conexão** para carregar e salvar.
- O `sw.js` busca sempre a versão mais nova do site e só usa a cópia guardada quando está offline. Para forçar a renovação do cache depois de uma grande atualização, troque `docctrl-shell-v5` por `v6` no `sw.js`.
- Os scripts no `index.html` têm `?v=6`: ao publicar uma atualização, aumente esse número (em todos os `<script>` e no CSS) para o navegador não usar arquivos antigos.
- Se você criar arquivos novos em `js/` ou `css/`, inclua-os na lista `SHELL` do `sw.js`.

## Privacidade e LGPD

- O repositório contém **apenas o código**. Os dados que você cadastra nunca vão para o GitHub.
- No **modo online**, os dados (empresas, CNPJ e status dos documentos) ficam no banco do Supabase, na região escolhida, e só são visíveis a quem pertence à equipe. Use senhas fortes, dê perfil **Consulta** a quem só precisa ver e remova quem sair da empresa.
- No **modo local**, os dados ficam só no navegador (`localStorage`, chave `docctrl.v2`). Limpar os dados do site apaga tudo. Use **Configurações → Exportar backup** com frequência.
- Cada endereço tem os seus próprios dados locais. Abrir `index.html` do computador e abrir o site do GitHub Pages são lugares diferentes.
- O exemplo inicial usa uma empresa **fictícia** (`seed()` em `js/store.js`). Se for público, não coloque dados reais no repositório.
- O sistema não envia nada para a Bernhoeft: você exporta o Excel e envia como já faz hoje.

## Estrutura do projeto

```
index.html                    página única
manifest.webmanifest          dados do app instalável (nome, ícones, cores)
sw.js                         service worker (instalação e abertura sem internet)
img/                          favicon e ícones (SVG, ICO e PNG)
css/style.css                 visual (tema claro e escuro, responsivo)
js/config.js                  URL e chave do Supabase (vazio = modo local)
js/store.js                   dados e regras de negócio
js/merge.js                   mescla de alterações simultâneas
js/cloud.js                   login, equipes e sincronização (Supabase)
js/ui.js                      componentes (modal, confirmação, máscaras de CPF e CNPJ)
js/export.js                  relatórios e exportação para Excel
js/pages.js                   telas
js/app.js                     rotas e tema
js/pwa.js                     botão "Instalar app"
js/vendor/                    ExcelJS 4.4.0 e supabase-js 2.112.3 (incluídos, funcionam offline)
supabase/schema.sql           tabelas, regras de acesso (RLS) e funções do banco
.github/workflows/keepalive.yml   (opcional) chamada periódica ao banco
```

## Personalizar

- **Documentos do checklist:** lista `DOCS` no topo de `js/store.js` (nome completo e nome curto das colunas). Se mudar os `id`, os status já lançados daquele documento deixam de aparecer.
- **Cores:** variáveis CSS no início de `css/style.css`.

## Tecnologias

HTML, CSS e JavaScript puros, [ExcelJS](https://github.com/exceljs/exceljs) (MIT) para os arquivos Excel e [supabase-js](https://github.com/supabase/supabase-js) (MIT) para o modo online.
