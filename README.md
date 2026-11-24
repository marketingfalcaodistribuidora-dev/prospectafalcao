# Prospecção Falcão

App de celular para o representante prospectar lojas de autopeças, postos de molas e comércios de peças de caminhão na região de Irecê (BA).

Site estático (HTML, CSS e JavaScript puros, sem dependências), publicado na Vercel.

## O que faz

- Escolhe a cidade, vê as empresas e **ordena por rota** (menor caminho de carro) ou **por certeza** (alta, média, baixa).
- Toca para ligar, abrir o WhatsApp, o Google Maps ou "Ir até aqui".
- Marca **Visitada** e escreve **anotações** em cada empresa. Tudo fica salvo no aparelho (`localStorage`), com gravação imediata.
- Abre no **tema claro**; o menu tem a opção de usar o tema escuro (fica lembrada no aparelho).
- Funciona sem internet depois da primeira abertura (service worker) e pode ser instalado na tela inicial.

## Dados

Os dados da lista ficam cifrados em `dados.enc` (AES-256-GCM, chave derivada de um código de acesso). O repositório é público, por isso o texto aberto (`dados.json`) **nunca** é versionado. O app pede o código na primeira vez e o guarda no aparelho.

Fontes: diretório Solutudo, Receita Federal (via BrasilAPI), Censo 2022 do IBGE (CNEFE, para localizar cada número de porta) e OSRM/OpenStreetMap (distâncias de carro).

## Atualizar os dados

1. Gerar o novo `dados.json` (script de coleta, fora deste repositório).
2. Cifrar: `node empacota.mjs dados.json dados.enc "<código de acesso>"`.
3. Commit e push: a Vercel publica sozinha.

As marcações dos representantes não se perdem numa atualização, porque ficam ligadas ao identificador de cada empresa.

## Publicar

`vercel --prod` (projeto no time Falcão Bahia). O `vercel.json` já bloqueia indexação (`noindex`) e define cabeçalhos de segurança.
