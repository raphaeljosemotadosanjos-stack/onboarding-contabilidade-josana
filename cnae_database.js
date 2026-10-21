// =========================================================================
// BANCO DE DADOS DE CNAEs COM ENQUADRAMENTO NO SIMPLES NACIONAL E FATOR R
// =========================================================================

const CNAE_CATALOG = [
  // --- TECNOLOGIA, SOFTWARE & INTERNET ---
  {
    codigo: "6201-5/01",
    denominacao: "Desenvolvimento de programas de computador sob encomenda",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III se Fator R >= 28%) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "software desenvolvimento programador ti programacao sistemas aplicativos app web tecnologia"
  },
  {
    codigo: "6202-3/00",
    denominacao: "Desenvolvimento e licenciamento de programas de computador customizáveis",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "software licenciamento ti sistemas erp saas tecnologia aplicativos"
  },
  {
    codigo: "6203-1/00",
    denominacao: "Desenvolvimento e licenciamento de programas de computador não-customizáveis",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "software produto software pronto saas plataformas jogos games"
  },
  {
    codigo: "6204-0/00",
    denominacao: "Consultoria em tecnologia da informação",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "consultoria ti suporte governanca seguranca informacao devops nuvem cloud"
  },
  {
    codigo: "6209-1/00",
    denominacao: "Suporte técnico, manutenção e outros serviços em tecnologia da informação",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "suporte tecnico manutencao computadores redes ti helpdesk formatacao"
  },
  {
    codigo: "6311-9/00",
    denominacao: "Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "hospedagem web hosting servidores data center banco de dados processamento"
  },
  {
    codigo: "6319-4/00",
    denominacao: "Portais, provedores de conteúdo e outros serviços de informação na internet",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "portal site blog conteudo online marketplace plataforma internet"
  },

  // --- SAÚDE, MEDICINA & BEM-ESTAR ---
  {
    codigo: "8630-5/03",
    denominacao: "Atividade médica ambulatorial restrita a consultas",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III se Fator R >= 28%) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "medico medicina consultas clinica medica clinico geral pediatra ginecologista cardiologista"
  },
  {
    codigo: "8630-5/01",
    denominacao: "Atividade médica ambulatorial com recursos para realização de procedimentos cirúrgicos",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "cirurgia ambulatorio pequena cirurgia procedimentos medicos"
  },
  {
    codigo: "8630-5/02",
    denominacao: "Atividade médica ambulatorial com recursos para realização de exames complementares",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "exames ultrassom raio x eletrocardiograma endoscopia diagnostico medico"
  },
  {
    codigo: "8630-5/04",
    denominacao: "Atividade odontológica",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "dentista odontologia dente ortodontia implantes clinica odontologica"
  },
  {
    codigo: "8650-0/04",
    denominacao: "Atividades de fisioterapia",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "fisioterapia fisioterapeuta pilates reabilitacao rpg motora ortopedica"
  },
  {
    codigo: "8650-0/03",
    denominacao: "Atividades de psicologia e psicanálise",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "psicologia psicologo psicanalise terapia saude mental consultorio"
  },
  {
    codigo: "8650-0/02",
    denominacao: "Atividades de profissionais da nutrição",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "nutricao nutricionista dieta alimentacao emagrecimento consultorio"
  },
  {
    codigo: "8650-0/06",
    denominacao: "Atividades de fonoaudiologia",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "fonoaudiologia fonoaudiologo voz fala audicao consultorio"
  },
  {
    codigo: "8690-9/01",
    denominacao: "Atividades de práticas integrativas e complementares em saúde humana",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "acupuntura reiki massoterapia cromoterapia floral aromaterapia holistica"
  },
  {
    codigo: "9602-5/02",
    denominacao: "Atividades de estética e outros serviços de cuidados com a beleza",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "estetica depilacao limpeza de pele maquiagem sobrancelha massagem corporal facial"
  },
  {
    codigo: "9602-5/01",
    denominacao: "Cabeleireiros, manicure e pedicure",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "cabeleireiro salao de beleza manicure pedicure corte barba barbearia"
  },

  // --- CONSULTORIA, MARKETING, DESIGN & PUBLICIDADE ---
  {
    codigo: "7319-0/02",
    denominacao: "Promoção de vendas",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "promocao de vendas marketing afiliados influenciador trafego comercial"
  },
  {
    codigo: "7311-4/00",
    denominacao: "Agências de publicidade",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "publicidade agencia marketing digital anuncios propaganda campanhas midia"
  },
  {
    codigo: "7319-0/03",
    denominacao: "Marketing direto",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "marketing direto email marketing malas diretas telemarketing"
  },
  {
    codigo: "7020-4/00",
    denominacao: "Atividades de consultoria em gestão empresarial",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "consultoria empresarial administracao gestao negocios planejamento financeiro"
  },
  {
    codigo: "7410-2/99",
    denominacao: "Atividades de design não especificadas anteriormente",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "design grafico ui ux web design artes visuais logotipo marcas"
  },
  {
    codigo: "7420-0/01",
    denominacao: "Atividades de produção de fotografias, exceto aérea e submarina",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "fotografo fotografia estudio fotos ensaios eventos casamentos"
  },
  {
    codigo: "5911-1/99",
    denominacao: "Atividades de produção cinematográfica, de vídeos e de programas de televisão",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "video gravacao audiovisual filmagem edicao canal youtube reels tiktok"
  },

  // --- ENGENHARIA, ARQUITETURA & CONSTRUÇÃO ---
  {
    codigo: "7112-0/00",
    denominacao: "Serviços de engenharia",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "engenharia engenheiro civil mecanico eletrico laudos projetos pericia crea"
  },
  {
    codigo: "7111-1/00",
    denominacao: "Serviços de arquitetura",
    anexo: "Anexo III (Fator R)",
    aliquota_inicial: "6,00% (Anexo III) ou 15,50% (Anexo V)",
    fator_r: true,
    palavras_chave: "arquitetura arquiteto projetos interiores urbanismo reformas cau"
  },
  {
    codigo: "4120-4/00",
    denominacao: "Construção de edifícios",
    anexo: "Anexo IV",
    aliquota_inicial: "4,50% (CPP recolhida à parte)",
    fator_r: false,
    palavras_chave: "construcao civil obras construtora predios casas reformas alvenaria"
  },
  {
    codigo: "4321-5/00",
    denominacao: "Instalação e manutenção elétrica",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "eletricista eletrica fiacao instalacao quadros de energia"
  },
  {
    codigo: "4322-3/01",
    denominacao: "Instalações hidráulicas, sanitárias e de gás",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "encanador hidraulica tubulacao esgoto gas encanamento"
  },
  {
    codigo: "4330-4/04",
    denominacao: "Serviços de pintura de edifícios em geral",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "pintor pintura residencial predial acabamento tintas reformas"
  },

  // --- JURÍDICO, CONTÁBIL & FINANCEIRO ---
  {
    codigo: "6911-7/01",
    denominacao: "Serviços advocatícios",
    anexo: "Anexo IV",
    aliquota_inicial: "4,50% (CPP recolhida à parte no INSS)",
    fator_r: false,
    palavras_chave: "advogado advocacia direito juridico oab processos consultoria juridica"
  },
  {
    codigo: "6920-6/01",
    denominacao: "Atividades de contabilidade",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "contabilidade contador escrituracao fiscal departamento pessoal crc"
  },
  {
    codigo: "6619-3/02",
    denominacao: "Correspondentes de instituições financeiras",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "correspondente bancario emprestimos financiamentos credito consignado"
  },
  {
    codigo: "6622-3/00",
    denominacao: "Corretores e agentes de seguros, de planos de previdência complementar e de saúde",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "corretor de seguros corretora planos de saude previdencia susep"
  },
  {
    codigo: "6821-8/01",
    denominacao: "Corretagem na compra e venda e avaliação de imóveis",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "corretor de imoveis imobiliaria corretagem venda locacao creci"
  },

  // --- EDUCAÇÃO, TREINAMENTOS & CURSOS ---
  {
    codigo: "8599-6/04",
    denominacao: "Treinamento em desenvolvimento profissional e gerencial",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "cursos treinamentos desenvolvimento profissional palestras workshops coaching infoproduto"
  },
  {
    codigo: "8599-6/03",
    denominacao: "Treinamento em informática",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "aulas de informatica cursos ti programacao computacao"
  },
  {
    codigo: "8593-7/00",
    denominacao: "Ensino de idiomas",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "escola de ingles espanhol linguas idiomas aulas particulares"
  },
  {
    codigo: "8591-1/00",
    denominacao: "Ensino de esportes",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "personal trainer academia natacao futebol lutas artes marciais esportes"
  },

  // --- COMÉRCIO VAREJISTA (ANEXO I - 4,00%) ---
  {
    codigo: "4711-3/02",
    denominacao: "Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - minimercados, mercearias e armazéns",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "mercado minimercado mercearia armazem alimentos vendas varejo supermercado"
  },
  {
    codigo: "4781-0/00",
    denominacao: "Comércio varejista de artigos do vestuário e acessórios",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "loja de roupas vestuario moda acessorios boutique camisas vestidos calcas varejo"
  },
  {
    codigo: "4782-8/01",
    denominacao: "Comércio varejista de calçados",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "loja de calcados sapatos tenis chinelos sandalias bolsas couro"
  },
  {
    codigo: "4771-7/01",
    denominacao: "Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "farmacia drogaria medicamentos remedios higiene perfumaria crf"
  },
  {
    codigo: "4772-5/00",
    denominacao: "Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "cosmeticos maquiagem perfumaria cremes cuidados pessoais sabonetes"
  },
  {
    codigo: "4751-2/01",
    denominacao: "Comércio varejista especializado de equipamentos e suprimentos de informática",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "loja de informatica computadores notebooks perifericos hardware acessorios impressoras"
  },
  {
    codigo: "4752-1/00",
    denominacao: "Comércio varejista especializado de equipamentos de telefonia e comunicação",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "loja de celulares smartphones capas peliculas carregadores telefonia"
  },
  {
    codigo: "4744-0/99",
    denominacao: "Comércio varejista de materiais de construção em geral",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "deposito de construcao materiais cimento tintas pisos ferramentas tubos"
  },
  {
    codigo: "4789-0/04",
    denominacao: "Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "pet shop racao animais cachorro gato pet acessorios passaros"
  },
  {
    codigo: "4761-0/01",
    denominacao: "Comércio varejista de livros",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "livraria livros didaticos literatura ebooks"
  },
  {
    codigo: "4761-0/03",
    denominacao: "Comércio varejista de artigos de papelaria",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "papelaria cadernos canetas materiais escolares escritorio presentes"
  },
  {
    codigo: "4789-0/99",
    denominacao: "Comércio varejista de outros produtos não especificados anteriormente",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "comercio varejista e-commerce loja virtual vendas online mercadorias diversas"
  },

  // --- ALIMENTAÇÃO, BARES & RESTAURANTES ---
  {
    codigo: "5611-2/01",
    denominacao: "Restaurantes e similares",
    anexo: "Anexo I (se refeição) / III",
    aliquota_inicial: "4,00% (Anexo I comércio de alimentação)",
    fator_r: false,
    palavras_chave: "restaurante comida refeicoes self service marmitex gastronomia bistro"
  },
  {
    codigo: "5611-2/03",
    denominacao: "Lanchonetes, casas de chá, de sucos e similares",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "lanchonete hamburgueria pasteis sucos salgados lanches cafeteria"
  },
  {
    codigo: "5611-2/04",
    denominacao: "Bares e outros estabelecimentos especializados em servir bebidas, sem entretenimento",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "bar boteco chopp cervejaria bebidas petiscos pub"
  },
  {
    codigo: "5620-1/04",
    denominacao: "Fornecimento de alimentos preparados preponderantemente para consumo domiciliar",
    anexo: "Anexo I (Comércio)",
    aliquota_inicial: "4,00%",
    fator_r: false,
    palavras_chave: "delivery marmitas marmitaria comida congelada ifood comida pronta"
  },
  {
    codigo: "1091-1/02",
    denominacao: "Fabricação de produtos de padaria e confeitaria com predominância de produção própria",
    anexo: "Anexo II (Indústria)",
    aliquota_inicial: "4,50%",
    fator_r: false,
    palavras_chave: "padaria confeitaria paes bolos doces salgados panificacao"
  },

  // --- LOGÍSTICA, TRANSPORTE & ENTREGAS ---
  {
    codigo: "4930-2/02",
    denominacao: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal, interestadual e internacional",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "transporte rodoviario frete transportadora caminhao cargas entregas"
  },
  {
    codigo: "4930-2/01",
    denominacao: "Transporte rodoviário de carga, exceto produtos perigosos e mudanças, municipal",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "transporte municipal frete local entregas carretos pequenas cargas"
  },
  {
    codigo: "5320-2/02",
    denominacao: "Serviços de entrega rápida",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "motoboy entregas rapidas delivery encomendas correio expresso aplicativo"
  },
  {
    codigo: "5211-7/99",
    denominacao: "Depósitos de mercadorias para terceiros, exceto armazéns gerais e guarda-móveis",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "armazem deposito estoque terceirizado fulfillment logistica"
  },

  // --- SERVIÇOS ADMINISTRATIVOS & APOIO ---
  {
    codigo: "8211-3/00",
    denominacao: "Serviços combinados de escritório e apoio administrativo",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "secretariado virtual bpo financeiro administrativo apoio digitacao cobranca"
  },
  {
    codigo: "8219-9/99",
    denominacao: "Preparação de documentos e serviços especializados de apoio administrativo não especificados anteriormente",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "preparacao documentos apoio administrativo despachante digitacao cadastros"
  },
  {
    codigo: "8121-4/00",
    denominacao: "Limpeza em prédios e em domicílios",
    anexo: "Anexo IV",
    aliquota_inicial: "4,50% (CPP recolhida à parte)",
    fator_r: false,
    palavras_chave: "empresa de limpeza conservacao faxina zeladoria servicos gerais"
  },
  {
    codigo: "8011-1/01",
    denominacao: "Atividades de vigilância e segurança privada",
    anexo: "Anexo IV",
    aliquota_inicial: "4,50% (CPP recolhida à parte)",
    fator_r: false,
    palavras_chave: "vigilancia seguranca privada portaria monitoramento vigia"
  },
  {
    codigo: "7711-0/00",
    denominacao: "Locação de automóveis sem condutor",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "locadora de veiculos aluguel de carros automoveis frotas"
  },
  {
    codigo: "7739-0/99",
    denominacao: "Aluguel de outras máquinas e equipamentos comerciais e industriais não especificados anteriormente",
    anexo: "Anexo III",
    aliquota_inicial: "6,00%",
    fator_r: false,
    palavras_chave: "locacao de maquinas aluguel de equipamentos ferramentas geradores"
  }
];

function buscarCnaes(termo) {
  if (!termo || termo.trim().length === 0) {
    return CNAE_CATALOG.slice(0, 15);
  }

  const normalizar = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = normalizar(termo.trim());

  return CNAE_CATALOG.filter(c => {
    return normalizar(c.codigo).includes(t) ||
           normalizar(c.denominacao).includes(t) ||
           normalizar(c.palavras_chave).includes(t) ||
           normalizar(c.anexo).includes(t);
  }).slice(0, 30);
}

module.exports = {
  CNAE_CATALOG,
  buscarCnaes
};
