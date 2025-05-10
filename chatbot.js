// chatbot.js
const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const axios = require('axios');

// Configurações
const CONFIG = {
  planilhaUrl: 'https://script.google.com/macros/s/AKfycby7U2eeAdTkwKNCMYXLN1CfTqjIX5WceIyjJqJqa_JI8RVb05IQpn623fM-vDIaSoND/exec',
  tempoDigitacao: 1500,
  tempoResposta: 30000
};

const client = new Client({
  puppeteer: {
    args: ['--no-sandbox']
  }
});

// Adiciona informação abaixo do nome do chatbot
client.on('authenticated', () => {
  client.setStatus("Esse número não recebe ligações");
});

const sessoes = {};

// Função para formatar data no fuso de Cuiabá (Node.js)
function formatarDataCuiaba() {
  const agora = new Date();
  
  // Ajusta para o fuso horário de Cuiabá (-04:00)
  const offsetLocal = agora.getTimezoneOffset(); // em minutos
  const offsetCuiaba = 240; // Cuiabá é UTC-4 (240 minutos)
  const diff = offsetLocal - offsetCuiaba;
  const dataAjustada = new Date(agora.getTime() + diff * 60000);

  // Formata manualmente no padrão DD/MM/YYYY HH:mm:ss
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
  client.setStatus("Esse número não recebe ligações. Obrigado.");
});

client.initialize();

async function enviarParaPlanilha(dados) {
  try {
    dados.data = formatarDataCuiaba(); // Usa o fuso de Cuiabá
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
    
    // Qualquer mensagem inicial aciona o menu
    await enviarMensagem(chat, from, 'Olá, sou o DISK DENGUE e estarei iniciando seu atendimento.');
    await enviarMensagem(chat, from, '🚨 Por favor, escolha o número da sua reclamação:\n\n1 - IMÓVEL C/ ASPECTO DE ABANDONO\n2 - TERRENO BALDIO\n3 - LIXO ACUMULADO\n4 - IMÓVEL C/ ACÚMULO DE DEPÓSITOS');
    sessoes[from].etapa = 'aguardando_opcao';
    return;
  }

  sessoes[from].ultimaInteracao = Date.now();

  try {
    if (sessoes[from].etapa === 'aguardando_opcao' && ['1','2','3','4'].includes(msg.body)) {
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

    if (sessoes[from].etapa === 'aguardando_descricao') {
      sessoes[from].dados.descricao = msg.body;
      sessoes[from].etapa = 'aguardando_endereco';
      await enviarMensagem(chat, from, 'Obrigado pela descrição. Vamos precisar do endereço completo.');
      await enviarMensagem(chat, from, 'Por favor, digite o nome da rua, avenida ou travessa com o número:');
      return;
    }

    if (sessoes[from].etapa === 'aguardando_endereco') {
      sessoes[from].dados.endereco = msg.body;
      sessoes[from].etapa = 'aguardando_referencia';
      await enviarMensagem(chat, from, 'Agora, nos informe um ponto de referência próximo:');
      await enviarMensagem(chat, from, '(Ex: "próximo ao mercado X", "em frente à praça")');
      return;
    }

    if (sessoes[from].etapa === 'aguardando_referencia') {
      sessoes[from].dados.referencia = msg.body;
      sessoes[from].etapa = 'aguardando_bairro';
      await enviarMensagem(chat, from, 'Para finalizar, qual o bairro?');
      return;
    }

    if (sessoes[from].etapa === 'aguardando_bairro') {
      sessoes[from].dados.bairro = msg.body;
      sessoes[from].etapa = 'aguardando_telefone';
      await enviarMensagem(chat, from, 'Caso nossa equipe precise entrar em contato, qual seu telefone?');
      await enviarMensagem(chat, from, '(Digite no formato DDD + número, ex: 67987654321)');
      return;
    }

    if (sessoes[from].etapa === 'aguardando_telefone') {
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

    if (sessoes[from].etapa === 'aguardando_avaliacao' && ['1','2','3','4','5'].includes(msg.body)) {
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

    // Se não estiver em nenhuma etapa específica, redireciona para o início
    if (!['aguardando_opcao', 'aguardando_descricao', 'aguardando_endereco', 'aguardando_referencia', 'aguardando_bairro', 'aguardando_telefone', 'aguardando_avaliacao'].includes(sessoes[from].etapa)) {
      sessoes[from].etapa = 'inicio';
      await enviarMensagem(chat, from, 'Olá, sou o DISK DENGUE e estarei iniciando seu atendimento.');
      await enviarMensagem(chat, from, '🚨 Por favor, escolha o número da sua reclamação:\n\n1 - IMÓVEL C/ ASPECTO DE ABANDONO\n2 - TERRENO BALDIO\n3 - LIXO ACUMULADO\n4 - IMÓVEL C/ ACÚMULO DE DEPÓSITOS');
      sessoes[from].etapa = 'aguardando_opcao';
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
  Object.keys(sessoes).forEach(from => {
    if (agora - sessoes[from].ultimaInteracao > CONFIG.tempoResposta) {
      delete sessoes[from];
    }
  });
}, 60000);

console.log('🚀 Iniciando bot Disk Dengue...');