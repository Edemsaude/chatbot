// chatbot.js
const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const axios = require('axios');

const CONFIG = {
  planilhaUrl: 'https://script.google.com/macros/s/AKfycbwVbHUXC1jNCCpFDmzxIgzvbR_BZCdX9fLJC9gF12ov95LjiRYPvNn5-9oDk6MpSwo/exec',
  tempoDigitacao: 1500,
  tempoResposta: 30000
};

const client = new Client({
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

const sessoes = {};

function formatarDataCuiaba() {
  const agora = new Date();
  const offsetLocal = agora.getTimezoneOffset();
  const offsetCuiaba = 240;
  const diff = offsetLocal - offsetCuiaba;
  const dataAjustada = new Date(agora.getTime() + diff * 60000);

  const dia = String(dataAjustada.getDate()).padStart(2, '0');
  const mes = String(dataAjustada.getMonth() + 1).padStart(2, '0');
  const ano = dataAjustada.getFullYear();
  const horas = String(dataAjustada.getHours()).padStart(2, '0');
  const minutos = String(dataAjustada.getMinutes()).padStart(2, '0');
  const segundos = String(dataAjustada.getSeconds()).padStart(2, '0');

  return `${dia}/${mes}/${ano} ${horas}:${minutos}:${segundos}`;
}

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
  console.log('✅ WhatsApp conectado!');
});

client.initialize();

async function enviarParaPlanilha(dados) {
  try {
    dados.data = formatarDataCuiaba();
    const response = await axios.post(CONFIG.planilhaUrl, {
      action: 'salvar_dados',
      data: dados
    });
    return response.data.success;
  } catch (error) {
    console.error('Erro ao enviar para planilha:', error.message);
    return false;
  }
}

async function enviarMensagem(chat, from, mensagem) {
  await chat.sendStateTyping();
  await new Promise(resolve => setTimeout(resolve, CONFIG.tempoDigitacao));
  await client.sendMessage(from, mensagem);
}

function gerarProtocolo() {
  const prefixo = "DEN";
  const data = new Date().toLocaleDateString('pt-BR', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '');
  const sequencia = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefixo}-${data}-${sequencia}`;
}

client.on('message', async msg => {
  if (!msg.from.endsWith('@c.us')) return;

  const chat = await msg.getChat();
  const contact = await msg.getContact();
  const from = msg.from;
  const nomeUsuario = contact.pushname || 'Não informado';

  if (!sessoes[from]) {
    sessoes[from] = {
      etapa: 'inicio',
      dados: { nomeUsuario },
      ultimaInteracao: Date.now()
    };

    await enviarMensagem(chat, from, 'Olá, sou o DISK DENGUE e estarei iniciando seu atendimento.');
    await enviarMensagem(chat, from, '🚨 Por favor, escolha o número da sua reclamação:\n\n1 - IMÓVEL C/ ASPECTO DE ABANDONO\n2 - TERRENO BALDIO\n3 - LIXO ACUMULADO\n4 - IMÓVEL C/ ACÚMULO DE DEPÓSITOS');
    sessoes[from].etapa = 'aguardando_opcao';
    return;
  }

  sessoes[from].ultimaInteracao = Date.now();
  try {
    const etapaAtual = sessoes[from].etapa;

    if (etapaAtual === 'aguardando_opcao' && ['1','2','3','4'].includes(msg.body)) {
      const tipos = {
        '1': 'IMÓVEL C/ ASPECTO DE ABANDONO',
        '2': 'TERRENO BALDIO',
        '3': 'LIXO ACUMULADO',
        '4': 'IMÓVEL C/ ACÚMULO DE DEPÓSITOS'
      };
      sessoes[from].dados.tipoReclamacao = tipos[msg.body];
      sessoes[from].etapa = 'aguardando_descricao';
      await enviarMensagem(chat, from, 'Por favor, descreva em poucas palavras o que está acontecendo:');
      return;
    }

    if (etapaAtual === 'aguardando_descricao') {
      sessoes[from].dados.descricao = msg.body;
      sessoes[from].etapa = 'aguardando_foto';
      await enviarMensagem(chat, from, 'Tem alguma foto que gostaria de nos enviar?');
      await enviarMensagem(chat, from, '(Se não tiver, apenas envie uma mensagem em branco para continuar)');
      return;
    }

    if (etapaAtual === 'aguardando_foto') {
      if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        const protocolo = sessoes[from].dados.protocolo;

        let linhaPlanilha = null;
        try {
          const res = await axios.get(CONFIG.planilhaUrl, {
            params: { protocolo }
          });
          if (res.data.success) linhaPlanilha = res.data.linha;
        } catch (e) {
          console.error("Erro ao localizar linha:", e.message);
        }

        if (!linhaPlanilha) {
          sessoes[from].dados.foto = 'Erro ao localizar linha';
        } else {
          try {
            const nomeArquivo = `${protocolo}-${Date.now()}.jpg`;
            const response = await axios.post(CONFIG.planilhaUrl, null, {
              params: {
                imagemBase64: media.data,
                linha: linhaPlanilha,
                nomeArquivo,
                tipoArquivo: media.mimetype
              }
            });

            sessoes[from].dados.foto = response.data.success ? response.data.link : 'Erro ao salvar imagem';
          } catch (error) {
            console.error('Erro ao enviar imagem:', error.message);
            sessoes[from].dados.foto = 'Erro ao enviar imagem';
          }
        }
      } else {
        sessoes[from].dados.foto = 'Não enviada';
      }
      sessoes[from].etapa = 'aguardando_endereco';
      await enviarMensagem(chat, from, 'Obrigado pela informação. Vamos precisar do endereço completo.');
      await enviarMensagem(chat, from, 'Por favor, digite o nome da rua, avenida ou travessa com o número:');
      return;
    }

    if (etapaAtual === 'aguardando_endereco') {
      sessoes[from].dados.endereco = msg.body;
      sessoes[from].etapa = 'aguardando_referencia';
      await enviarMensagem(chat, from, 'Agora, nos informe um ponto de referência próximo:');
      await enviarMensagem(chat, from, '(Ex: "próximo ao mercado X", "em frente à praça")');
      return;
    }

    if (etapaAtual === 'aguardando_referencia') {
      sessoes[from].dados.referencia = msg.body;
      sessoes[from].etapa = 'aguardando_bairro';
      await enviarMensagem(chat, from, 'Para finalizar, qual o bairro?');
      return;
    }

    if (etapaAtual === 'aguardando_bairro') {
      sessoes[from].dados.bairro = msg.body;
      sessoes[from].etapa = 'aguardando_telefone';
      await enviarMensagem(chat, from, 'Caso nossa equipe precise entrar em contato, qual seu telefone?');
      await enviarMensagem(chat, from, '(Digite no formato DDD + número, ex: 67987654321)');
      return;
    }

    if (etapaAtual === 'aguardando_telefone') {
      if (!msg.body.match(/^\d{10,11}$/)) {
        await enviarMensagem(chat, from, 'Formato inválido. Por favor, digite apenas números com DDD (ex: 21987654321)');
        return;
      }

      sessoes[from].dados.telefone = msg.body;
      sessoes[from].dados.protocolo = gerarProtocolo();
      sessoes[from].etapa = 'aguardando_avaliacao';

      await enviarMensagem(chat, from, 'Obrigado pelas informações!');
      await enviarMensagem(chat, from, `Seu número de protocolo é: ${sessoes[from].dados.protocolo}`);
      await enviarMensagem(chat, from, 'Sua reclamação será encaminhada para nossa equipe.');
      await enviarMensagem(chat, from, 'Por favor, avalie nosso atendimento de 1 a 5:');
      await enviarMensagem(chat, from, '1 - Péssimo | 2 - Ruim | 3 - Regular | 4 - Bom | 5 - Ótimo');
      return;
    }

    if (etapaAtual === 'aguardando_avaliacao' && ['1','2','3','4','5'].includes(msg.body)) {
      sessoes[from].dados.avaliacao = msg.body;
      const salvou = await enviarParaPlanilha(sessoes[from].dados);

      if (salvou) {
        await enviarMensagem(chat, from, '✅ Obrigado pelo seu contato! Seu protocolo foi registrado com sucesso.');
      } else {
        await enviarMensagem(chat, from, '⚠️ Obrigado pelo seu contato! Sua reclamação foi recebida, mas houve um problema ao registrar o protocolo.');
      }

      delete sessoes[from];
      return;
    }

    await enviarMensagem(chat, from, 'Desculpe, não entendi. Por favor, responda com uma das opções válidas.');

  } catch (error) {
    console.error('Erro no atendimento:', error);
    await enviarMensagem(chat, from, 'Desculpe, ocorreu um erro. Por favor, inicie novamente o atendimento.');
    delete sessoes[from];
  }
});

setInterval(() => {
  const agora = Date.now();
  for (const from in sessoes) {
    if (agora - sessoes[from].ultimaInteracao > CONFIG.tempoResposta) {
      delete sessoes[from];
    }
  }
}, 60000);

console.log('🚀 Iniciando bot Disk Dengue...');
