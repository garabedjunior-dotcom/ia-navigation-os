/* ============================================
   IA Navigation OS — App Logic
   ============================================ */

(function () {
  'use strict';

  // ---- State ----
  let seedData = null;
  let cy = null;
  let currentNodeId = null;
  let expandedNodes = new Set(['L0']);
  let visibleNodes = new Set();
  let wizardStep = 0;
  let wizardAnswers = {};

  // ---- Color Map ----
  const TYPE_COLORS = {
    LAYER: '#6366f1',
    CATEGORY: '#0ea5e9',
    CONCEPT: '#10b981',
    TOOL: '#f59e0b',
    PLAYBOOK: '#ef4444'
  };

  const TYPE_LABELS = {
    LAYER: 'Camada',
    CATEGORY: 'Categoria',
    CONCEPT: 'Conceito',
    TOOL: 'Ferramenta',
    PLAYBOOK: 'Playbook'
  };

  // ---- Wizard Questions ----
  const WIZARD_QUESTIONS = [
    {
      id: 'app_type',
      title: 'Que tipo de aplicação você quer construir?',
      subtitle: 'Escolha o que mais se aproxima do seu objetivo.',
      options: [
        { value: 'landing', label: 'Landing Page', desc: 'Página de captura de leads', icon: 'layout' },
        { value: 'saas', label: 'SaaS / App Web', desc: 'Sistema com login, CRUD, dashboard', icon: 'app-window' },
        { value: 'crm', label: 'CRM', desc: 'Gerenciar contatos, vendas e pipeline', icon: 'users' },
        { value: 'dashboard', label: 'Dashboard', desc: 'Painel analítico com KPIs e gráficos', icon: 'bar-chart-3' },
        { value: 'agent', label: 'Agente de IA', desc: 'IA que executa tarefas com ferramentas', icon: 'bot' },
        { value: 'automation', label: 'Automação', desc: 'Workflows e integrações entre sistemas', icon: 'workflow' },
        { value: 'bot_whatsapp', label: 'Bot WhatsApp', desc: 'Chatbot com respostas automáticas', icon: 'message-circle' },
        { value: 'ecommerce', label: 'E-commerce', desc: 'Loja online com carrinho e pagamento', icon: 'shopping-cart' },
        { value: 'marketplace', label: 'Marketplace', desc: 'Plataforma com vendedores e compradores', icon: 'store' },
        { value: 'internal_tool', label: 'Ferramenta Interna', desc: 'Sistema para uso da equipe', icon: 'wrench' },
        { value: 'mobile', label: 'App Mobile', desc: 'Aplicativo para iOS/Android', icon: 'smartphone' }
      ]
    },
    {
      id: 'needs_auth',
      title: 'Precisa de login e autenticação?',
      subtitle: 'Usuários precisam criar conta e fazer login?',
      options: [
        { value: true, label: 'Sim', desc: 'Login, cadastro, perfis de usuário', icon: 'lock' },
        { value: false, label: 'Não', desc: 'Acesso público, sem conta', icon: 'unlock' }
      ]
    },
    {
      id: 'needs_db',
      title: 'Precisa de banco de dados?',
      subtitle: 'Vai salvar dados de usuários, produtos, transações?',
      options: [
        { value: true, label: 'Sim', desc: 'Salvar e consultar dados', icon: 'database' },
        { value: false, label: 'Não', desc: 'Conteúdo estático ou externo', icon: 'file-text' }
      ]
    },
    {
      id: 'needs_rag',
      title: 'Precisa de IA com memória (RAG)?',
      subtitle: 'Chat que responde com base em seus documentos/dados?',
      options: [
        { value: true, label: 'Sim', desc: 'Chat com documentos, busca semântica', icon: 'brain' },
        { value: false, label: 'Não', desc: 'Sem necessidade de RAG', icon: 'x-circle' }
      ]
    },
    {
      id: 'budget',
      title: 'Qual seu orçamento e velocidade?',
      subtitle: 'Isso influencia a complexidade da stack recomendada.',
      options: [
        { value: 'low', label: 'Rápido e Barato', desc: 'MVP com ferramentas gratuitas/baratas', icon: 'zap' },
        { value: 'medium', label: 'Equilibrado', desc: 'Bom custo-benefício, escalável', icon: 'scale' },
        { value: 'high', label: 'Robusto e Completo', desc: 'Investir em qualidade e monitoramento', icon: 'shield' }
      ]
    },
    {
      id: 'user_level',
      title: 'Qual seu nível técnico?',
      subtitle: 'Isso ajuda a calibrar as recomendações.',
      options: [
        { value: 'beginner', label: 'Iniciante', desc: 'Nunca programei, uso ferramentas no-code', icon: 'baby' },
        { value: 'intermediate', label: 'Intermediário', desc: 'Entendo o básico, uso IA para codificar', icon: 'user' },
        { value: 'advanced', label: 'Avançado', desc: 'Codifico com assistência de IA', icon: 'code-2' }
      ]
    }
  ];

  // ============================================
  // INIT
  // ============================================
  async function init() {
    try {
      const resp = await fetch('data/seed.json');
      seedData = await resp.json();
      initGraph();
      initSearch();
      initWizard();
      initControls();
      lucide.createIcons();
      showToast('Mapa carregado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao carregar seed:', err);
      showToast('Erro ao carregar dados. Verifique o console.', 'warning');
    }
  }

  // ============================================
  // GRAPH
  // ============================================
  function initGraph() {
    // Start with L0 and its direct children
    const initialNodes = getInitialNodes();
    const initialEdges = getEdgesForNodes(initialNodes);

    cy = cytoscape({
      container: document.getElementById('cy'),
      elements: {
        nodes: initialNodes.map(n => ({
          data: {
            id: n.id,
            label: n.name,
            type: n.type,
            level: n.level,
            color: TYPE_COLORS[n.type] || '#6b7280'
          }
        })),
        edges: initialEdges.map(e => ({
          data: {
            id: e.from + '-' + e.to,
            source: e.from,
            target: e.to,
            relation: e.relation
          }
        }))
      },
      style: getCyStyle(),
      layout: getLayout(initialNodes.length),
      minZoom: 0.3,
      maxZoom: 3,
      wheelSensitivity: 0.3
    });

    // Track visible nodes
    initialNodes.forEach(n => visibleNodes.add(n.id));

    // Events
    cy.on('tap', 'node', function (evt) {
      const nodeId = evt.target.id();
      selectNode(nodeId);
    });

    cy.on('tap', function (evt) {
      if (evt.target === cy) {
        closePanel();
      }
    });

    updateStats();
  }

  function getCyStyle() {
    return [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'color': '#e8eaf0',
          'font-size': '11px',
          'font-family': 'Inter, sans-serif',
          'font-weight': '500',
          'text-wrap': 'wrap',
          'text-max-width': '90px',
          'background-color': 'data(color)',
          'border-width': 2,
          'border-color': 'data(color)',
          'border-opacity': 0.4,
          'width': 'mapData(level, 0, 4, 70, 40)',
          'height': 'mapData(level, 0, 4, 70, 40)',
          'text-outline-color': '#0f1117',
          'text-outline-width': 2,
          'overlay-padding': '6px',
          'transition-property': 'background-color, border-color, width, height',
          'transition-duration': '0.2s'
        }
      },
      {
        selector: 'node[type="LAYER"]',
        style: {
          'shape': 'round-rectangle',
          'width': 80,
          'height': 50,
          'font-size': '12px',
          'font-weight': '700',
          'background-opacity': 0.9
        }
      },
      {
        selector: 'node[type="CATEGORY"]',
        style: {
          'shape': 'round-rectangle',
          'width': 70,
          'height': 42,
          'font-size': '10px',
          'background-opacity': 0.85
        }
      },
      {
        selector: 'node[type="CONCEPT"]',
        style: {
          'shape': 'ellipse',
          'width': 55,
          'height': 55,
          'font-size': '10px',
          'background-opacity': 0.8
        }
      },
      {
        selector: 'node[type="TOOL"]',
        style: {
          'shape': 'round-hexagon',
          'width': 58,
          'height': 58,
          'font-size': '10px',
          'background-opacity': 0.85
        }
      },
      {
        selector: 'node[type="PLAYBOOK"]',
        style: {
          'shape': 'round-diamond',
          'width': 60,
          'height': 60,
          'font-size': '9px',
          'background-opacity': 0.8
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
          'border-opacity': 1,
          'background-opacity': 1
        }
      },
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
          'border-opacity': 0.9,
          'background-opacity': 1,
          'z-index': 999
        }
      },
      {
        selector: 'node.faded',
        style: {
          'opacity': 0.25
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': '#2a2d42',
          'target-arrow-color': '#2a2d42',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          'curve-style': 'bezier',
          'opacity': 0.6,
          'transition-property': 'line-color, opacity',
          'transition-duration': '0.2s'
        }
      },
      {
        selector: 'edge[relation="RECOMMENDED_WITH"]',
        style: {
          'line-style': 'dashed',
          'line-color': '#4b5563',
          'target-arrow-color': '#4b5563'
        }
      },
      {
        selector: 'edge[relation="REQUIRES"]',
        style: {
          'line-color': '#ef4444',
          'target-arrow-color': '#ef4444',
          'width': 2
        }
      },
      {
        selector: 'edge[relation="USES"]',
        style: {
          'line-style': 'dotted',
          'line-color': '#6366f1',
          'target-arrow-color': '#6366f1'
        }
      },
      {
        selector: 'edge.highlighted',
        style: {
          'opacity': 1,
          'line-color': '#6366f1',
          'target-arrow-color': '#6366f1',
          'width': 2.5,
          'z-index': 999
        }
      },
      {
        selector: 'edge.faded',
        style: {
          'opacity': 0.1
        }
      }
    ];
  }

  function getLayout(nodeCount) {
    return {
      name: 'fcose',
      animate: true,
      animationDuration: 600,
      animationEasing: 'ease-out',
      randomize: false,
      fit: true,
      padding: 50,
      nodeDimensionsIncludeLabels: true,
      idealEdgeLength: nodeCount > 30 ? 120 : 160,
      nodeRepulsion: nodeCount > 30 ? 6000 : 8000,
      edgeElasticity: 0.45,
      gravity: 0.25,
      gravityRange: 3.8,
      nestingFactor: 0.1,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 20,
      tilingPaddingHorizontal: 20
    };
  }

  function getInitialNodes() {
    // L0 + level 1 nodes
    return seedData.nodes.filter(n => n.level <= 1);
  }

  function getEdgesForNodes(nodes) {
    const ids = new Set(nodes.map(n => n.id));
    return seedData.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  }

  function getNodeById(id) {
    return seedData.nodes.find(n => n.id === id);
  }

  function getPlaybookById(id) {
    return seedData.playbooks.find(p => p.id === id);
  }

  function getChildNodes(parentId) {
    const childEdges = seedData.edges.filter(e => e.from === parentId);
    return childEdges.map(e => getNodeById(e.to)).filter(Boolean);
  }

  function getConnections(nodeId) {
    const conns = [];
    seedData.edges.forEach(e => {
      if (e.from === nodeId) {
        const target = getNodeById(e.to);
        if (target) conns.push({ node: target, relation: e.relation, direction: 'outgoing' });
      }
      if (e.to === nodeId) {
        const source = getNodeById(e.from);
        if (source) conns.push({ node: source, relation: e.relation, direction: 'incoming' });
      }
    });
    return conns;
  }

  // ============================================
  // NODE SELECTION & PANEL
  // ============================================
  function selectNode(nodeId) {
    currentNodeId = nodeId;
    const node = getNodeById(nodeId);
    if (!node) return;

    // Highlight in graph
    cy.elements().removeClass('highlighted faded');
    const cyNode = cy.getElementById(nodeId);
    if (cyNode.length) {
      cyNode.addClass('highlighted');
      const neighborhood = cyNode.neighborhood();
      neighborhood.addClass('highlighted');
      cy.elements().not(cyNode).not(neighborhood).addClass('faded');
    }

    // Update breadcrumb
    updateBreadcrumb(nodeId);

    // Open panel
    openPanel(node);
  }

  function openPanel(node) {
    const panel = document.getElementById('side-panel');
    panel.classList.remove('closed');

    // Type badge
    const badge = document.getElementById('card-type-badge');
    badge.textContent = TYPE_LABELS[node.type] || node.type;
    badge.className = 'type-badge ' + node.type;

    // Title & summary
    document.getElementById('card-title').textContent = node.name;
    document.getElementById('card-summary').textContent = node.summary_leigo;

    // Details
    const detailsEl = document.getElementById('card-details');
    detailsEl.innerHTML = '';
    if (node.details && Object.keys(node.details).length > 0) {
      const detailLabels = {
        what_is: 'O que é',
        why_matters: 'Por que importa',
        common_confusion: 'Confusão comum',
        free_tier: 'Plano gratuito',
        learning_curve: 'Curva de aprendizado',
        when_use: 'Quando usar',
        when_not: 'Quando NÃO usar',
        lock_in: 'Lock-in',
        best_combos: 'Melhores combinações'
      };

      Object.entries(node.details).forEach(([key, val]) => {
        const row = document.createElement('div');
        row.className = 'detail-row';

        const label = document.createElement('span');
        label.className = 'detail-label';
        label.textContent = detailLabels[key] || key;

        const value = document.createElement('span');
        value.className = 'detail-value';

        if (Array.isArray(val)) {
          value.textContent = val.join(', ');
        } else if (key === 'learning_curve') {
          value.textContent = '⭐'.repeat(val) + '☆'.repeat(5 - val);
        } else {
          value.textContent = val;
        }

        row.appendChild(label);
        row.appendChild(value);
        detailsEl.appendChild(row);
      });
    }

    // Tags
    const tagsEl = document.getElementById('card-tags');
    tagsEl.innerHTML = '';
    if (node.tags && node.tags.length) {
      node.tags.forEach(t => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        tagsEl.appendChild(tag);
      });
    }

    // Connections
    const connections = getConnections(node.id);
    const connList = document.getElementById('connections-list');
    connList.innerHTML = '';
    connections.forEach(c => {
      const item = document.createElement('div');
      item.className = 'connection-item';
      item.innerHTML = `
        <span class="conn-dot" style="background:${TYPE_COLORS[c.node.type] || '#6b7280'}"></span>
        <span>${c.node.name}</span>
        <span class="conn-relation">${c.relation}</span>
      `;
      item.addEventListener('click', () => {
        // Ensure node is visible, expand if needed
        if (!visibleNodes.has(c.node.id)) {
          expandToNode(c.node.id);
        }
        selectNode(c.node.id);
        const cyNode = cy.getElementById(c.node.id);
        if (cyNode.length) {
          cy.animate({ center: { eles: cyNode }, duration: 400 });
        }
      });
      connList.appendChild(item);
    });

    // Playbook
    const playbookSection = document.getElementById('card-playbook');
    const playbookContent = document.getElementById('playbook-content');
    playbookContent.innerHTML = '';

    if (node.type === 'PLAYBOOK') {
      const pb = getPlaybookById(node.id);
      if (pb) {
        playbookSection.classList.remove('hidden');
        playbookContent.innerHTML = renderPlaybook(pb);
      } else {
        playbookSection.classList.add('hidden');
      }
    } else {
      playbookSection.classList.add('hidden');
    }

    // Update icons
    lucide.createIcons();
  }

  function renderPlaybook(pb) {
    let html = '';

    html += `<div class="playbook-section">
      <div class="playbook-section-title">🎯 Objetivo</div>
      <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5">${pb.goal}</p>
    </div>`;

    if (pb.prerequisites && pb.prerequisites.length) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">📋 Pré-requisitos</div>
        <ul class="playbook-list">${pb.prerequisites.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`;
    }

    if (pb.steps && pb.steps.length) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">📌 Passos</div>
        <ul class="playbook-list">${pb.steps.map((s, i) => `<li><strong>${i + 1}.</strong> ${s}</li>`).join('')}</ul>
      </div>`;
    }

    if (pb.pitfalls && pb.pitfalls.length) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">⚠️ Riscos Comuns</div>
        <ul class="playbook-list pitfalls">${pb.pitfalls.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`;
    }

    if (pb.done_definition) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">✅ Definição de Pronto</div>
        <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.5">${pb.done_definition}</p>
      </div>`;
    }

    if (pb.stack_variants) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">🔧 Variantes de Stack</div>`;
      Object.entries(pb.stack_variants).forEach(([key, stack]) => {
        html += `<div class="stack-variant">
          <div class="stack-variant-label">${key === 'rapida' ? '⚡ Rápida' : '🛡️ Robusta'}</div>
          <div class="stack-pills">${stack.map(s => `<span class="stack-pill ${key === 'rapida' ? 'alt' : ''}">${s}</span>`).join('')}</div>
        </div>`;
      });
      html += `</div>`;
    }

    if (pb.prompts && pb.prompts.length) {
      html += `<div class="playbook-section">
        <div class="playbook-section-title">💬 Prompts Sugeridos</div>
        <ul class="playbook-list prompts">${pb.prompts.map(p => `<li style="font-style:italic">"${p}"</li>`).join('')}</ul>
      </div>`;
    }

    return html;
  }

  function closePanel() {
    document.getElementById('side-panel').classList.add('closed');
    cy.elements().removeClass('highlighted faded');
    currentNodeId = null;
  }

  // ============================================
  // BREADCRUMB
  // ============================================
  function updateBreadcrumb(nodeId) {
    const trail = document.getElementById('breadcrumb-trail');
    const path = getNodePath(nodeId);

    trail.innerHTML = path.map((n, i) => {
      const isLast = i === path.length - 1;
      let html = '';
      if (i > 0) html += '<span class="crumb-sep">›</span>';
      html += `<span class="crumb ${isLast ? 'active' : ''}" data-id="${n.id}">${n.name}</span>`;
      return html;
    }).join('');

    // Click handlers
    trail.querySelectorAll('.crumb').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (!visibleNodes.has(id)) expandToNode(id);
        selectNode(id);
        const cyNode = cy.getElementById(id);
        if (cyNode.length) cy.animate({ center: { eles: cyNode }, duration: 400 });
      });
    });
  }

  function getNodePath(nodeId) {
    const path = [];
    let current = nodeId;
    const visited = new Set();

    while (current && !visited.has(current)) {
      visited.add(current);
      const node = getNodeById(current);
      if (node) path.unshift(node);

      // Find parent (BELONGS_TO edge where target is current)
      const parentEdge = seedData.edges.find(e => e.to === current && e.relation === 'BELONGS_TO');
      current = parentEdge ? parentEdge.from : null;
    }

    return path;
  }

  // ============================================
  // EXPAND NODES
  // ============================================
  function expandNode(nodeId) {
    const children = getChildNodes(nodeId);
    if (children.length === 0) {
      showToast('Este nó não tem filhos para expandir.', 'info');
      return;
    }

    expandedNodes.add(nodeId);
    let addedCount = 0;

    children.forEach(child => {
      if (!visibleNodes.has(child.id)) {
        visibleNodes.add(child.id);
        cy.add({
          data: {
            id: child.id,
            label: child.name,
            type: child.type,
            level: child.level,
            color: TYPE_COLORS[child.type] || '#6b7280'
          }
        });
        addedCount++;
      }
    });

    // Add edges
    const allVisible = new Set(visibleNodes);
    seedData.edges.forEach(e => {
      if (allVisible.has(e.from) && allVisible.has(e.to)) {
        const edgeId = e.from + '-' + e.to;
        if (cy.getElementById(edgeId).length === 0) {
          cy.add({
            data: {
              id: edgeId,
              source: e.from,
              target: e.to,
              relation: e.relation
            }
          });
        }
      }
    });

    if (addedCount > 0) {
      // Re-layout
      cy.layout(getLayout(visibleNodes.size)).run();
      showToast(`${addedCount} nó(s) expandido(s)!`, 'success');
    } else {
      showToast('Todos os filhos já estão visíveis.', 'info');
    }

    updateStats();
  }

  function expandToNode(targetId) {
    // Find path and expand all ancestors
    const path = getNodePath(targetId);
    path.forEach(n => {
      if (!visibleNodes.has(n.id)) {
        visibleNodes.add(n.id);
        cy.add({
          data: {
            id: n.id,
            label: n.name,
            type: n.type,
            level: n.level,
            color: TYPE_COLORS[n.type] || '#6b7280'
          }
        });
      }
    });

    // Add edges for all visible
    const allVisible = new Set(visibleNodes);
    seedData.edges.forEach(e => {
      if (allVisible.has(e.from) && allVisible.has(e.to)) {
        const edgeId = e.from + '-' + e.to;
        if (cy.getElementById(edgeId).length === 0) {
          cy.add({
            data: {
              id: edgeId,
              source: e.from,
              target: e.to,
              relation: e.relation
            }
          });
        }
      }
    });

    cy.layout(getLayout(visibleNodes.size)).run();
    updateStats();
  }

  function expandAll() {
    seedData.nodes.forEach(n => {
      if (!visibleNodes.has(n.id)) {
        visibleNodes.add(n.id);
        cy.add({
          data: {
            id: n.id,
            label: n.name,
            type: n.type,
            level: n.level,
            color: TYPE_COLORS[n.type] || '#6b7280'
          }
        });
      }
    });

    seedData.edges.forEach(e => {
      const edgeId = e.from + '-' + e.to;
      if (cy.getElementById(edgeId).length === 0) {
        cy.add({
          data: {
            id: edgeId,
            source: e.from,
            target: e.to,
            relation: e.relation
          }
        });
      }
    });

    cy.layout(getLayout(visibleNodes.size)).run();
    updateStats();
  }

  // ============================================
  // SEARCH
  // ============================================
  function initSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    let debounceTimer;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = input.value.trim().toLowerCase();
        if (query.length < 2) {
          results.classList.add('hidden');
          return;
        }

        const matches = seedData.nodes.filter(n => {
          const searchable = [n.name, n.summary_leigo, ...(n.tags || [])].join(' ').toLowerCase();
          return searchable.includes(query);
        }).slice(0, 12);

        if (matches.length === 0) {
          results.innerHTML = '<div class="search-result-item"><span class="sr-name" style="color:var(--text-muted)">Nenhum resultado encontrado</span></div>';
          results.classList.remove('hidden');
          return;
        }

        results.innerHTML = matches.map(n => `
          <div class="search-result-item" data-id="${n.id}">
            <span class="sr-dot" style="background:${TYPE_COLORS[n.type] || '#6b7280'}"></span>
            <span class="sr-name">${highlightMatch(n.name, query)}</span>
            <span class="sr-type">${TYPE_LABELS[n.type] || n.type}</span>
          </div>
        `).join('');

        results.classList.remove('hidden');

        results.querySelectorAll('.search-result-item[data-id]').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.id;
            if (!visibleNodes.has(id)) expandToNode(id);
            selectNode(id);
            const cyNode = cy.getElementById(id);
            if (cyNode.length) cy.animate({ center: { eles: cyNode }, duration: 400 });
            results.classList.add('hidden');
            input.value = '';
          });
        });
      }, 200);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        results.classList.add('hidden');
      }
    });

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape') {
        results.classList.add('hidden');
        input.blur();
      }
    });
  }

  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return text.slice(0, idx) + '<strong style="color:var(--accent-indigo)">' + text.slice(idx, idx + query.length) + '</strong>' + text.slice(idx + query.length);
  }

  // ============================================
  // WIZARD
  // ============================================
  function initWizard() {
    document.getElementById('btn-wizard').addEventListener('click', openWizard);
    document.getElementById('btn-close-wizard').addEventListener('click', closeWizard);
    document.getElementById('wizard-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeWizard();
    });
    document.getElementById('wizard-back').addEventListener('click', wizardPrev);
    document.getElementById('wizard-next').addEventListener('click', wizardNext);
    document.getElementById('wizard-restart').addEventListener('click', () => {
      document.getElementById('wizard-result').classList.add('hidden');
      document.getElementById('wizard-body').style.display = '';
      document.getElementById('wizard-footer').style.display = '';
      wizardStep = 0;
      wizardAnswers = {};
      renderWizardStep();
    });
    document.getElementById('wizard-close-result').addEventListener('click', closeWizard);
  }

  function openWizard() {
    wizardStep = 0;
    wizardAnswers = {};
    document.getElementById('wizard-overlay').classList.remove('hidden');
    document.getElementById('wizard-result').classList.add('hidden');
    document.getElementById('wizard-body').style.display = '';
    document.getElementById('wizard-footer').style.display = '';
    renderWizardStep();
  }

  function closeWizard() {
    document.getElementById('wizard-overlay').classList.add('hidden');
  }

  function renderWizardStep() {
    const q = WIZARD_QUESTIONS[wizardStep];
    const container = document.getElementById('wizard-step-container');
    const total = WIZARD_QUESTIONS.length;

    // Progress
    document.getElementById('wizard-progress-bar').style.width = ((wizardStep + 1) / total * 100) + '%';
    document.getElementById('wizard-step-num').textContent = wizardStep + 1;
    document.getElementById('wizard-step-total').textContent = total;

    // Back button
    document.getElementById('wizard-back').style.visibility = wizardStep === 0 ? 'hidden' : 'visible';

    // Next button text
    const nextBtn = document.getElementById('wizard-next');
    nextBtn.innerHTML = wizardStep === total - 1
      ? 'Ver Recomendação <i data-lucide="sparkles"></i>'
      : 'Próximo <i data-lucide="arrow-right"></i>';

    // Render question
    container.innerHTML = `
      <div class="wizard-question">
        <h3>${q.title}</h3>
        <p>${q.subtitle}</p>
        <div class="wizard-options">
          ${q.options.map(opt => `
            <div class="wizard-option ${wizardAnswers[q.id] === opt.value ? 'selected' : ''}" data-value="${opt.value}">
              <div class="wo-icon"><i data-lucide="${opt.icon}"></i></div>
              <div class="wo-text">
                <strong>${opt.label}</strong>
                <small>${opt.desc}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Option click handlers
    container.querySelectorAll('.wizard-option').forEach(el => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        let val = el.dataset.value;
        // Parse booleans
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        wizardAnswers[q.id] = val;
      });
    });

    lucide.createIcons();
  }

  function wizardNext() {
    const q = WIZARD_QUESTIONS[wizardStep];
    if (wizardAnswers[q.id] === undefined) {
      showToast('Selecione uma opção para continuar.', 'warning');
      return;
    }

    if (wizardStep < WIZARD_QUESTIONS.length - 1) {
      wizardStep++;
      renderWizardStep();
    } else {
      // Generate result
      generateWizardResult();
    }
  }

  function wizardPrev() {
    if (wizardStep > 0) {
      wizardStep--;
      renderWizardStep();
    }
  }

  function generateWizardResult() {
    const result = matchDecisionRule(wizardAnswers);

    // Hide steps, show result
    document.getElementById('wizard-body').style.display = 'none';
    document.getElementById('wizard-footer').style.display = 'none';
    const resultEl = document.getElementById('wizard-result');
    resultEl.classList.remove('hidden');

    const content = document.getElementById('wizard-result-content');
    content.innerHTML = renderWizardResultHTML(result, wizardAnswers);
    lucide.createIcons();
    
    // Initialize prompt generator
    initPromptGenerator();
  }

  function matchDecisionRule(answers) {
    const rules = seedData.decision_rules;

    // Score each rule
    let bestRule = null;
    let bestScore = -1;

    rules.forEach(rule => {
      let score = 0;
      const cond = rule.if;

      if (cond.app_type && cond.app_type === answers.app_type) score += 10;
      if (cond.needs_auth !== undefined && cond.needs_auth === answers.needs_auth) score += 3;
      if (cond.needs_db !== undefined && cond.needs_db === answers.needs_db) score += 3;
      if (cond.needs_rag !== undefined && cond.needs_rag === answers.needs_rag) score += 5;
      if (cond.budget && cond.budget === answers.budget) score += 4;

      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    });

    // Fallback: generic SaaS rule
    if (!bestRule) {
      bestRule = rules.find(r => r.id === 'R2') || rules[0];
    }

    // Adjust for user level
    let adjustedResult = JSON.parse(JSON.stringify(bestRule.then));

    if (answers.user_level === 'beginner') {
      // Prefer builders
      if (!adjustedResult.primary_stack.some(s => s.toLowerCase().includes('builder') || s.toLowerCase().includes('lovable') || s.toLowerCase().includes('bolt'))) {
        adjustedResult.tools_to_master.unshift('Builder (Lovable/Bolt)');
      }
    }

    return {
      rule: bestRule,
      result: adjustedResult,
      answers: answers
    };
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  function findPlaybookForResult(data) {
    const r = data.result;
    const answers = data.answers;
    
    // Try to find a matching playbook based on the result
    const playbooks = seedData.playbooks;
    
    // Map app types to playbook IDs
    const appTypeToPlaybook = {
      'landing': 'P_LP_LEADS',
      'saas': 'P_SAAS_MVP',
      'crm': 'P_CRM_SIMPLE',
      'dashboard': 'P_DASHBOARD',
      'agent': 'P_AGENT_BUILDER',
      'automation': 'P_EMAIL_AUTO',
      'bot_whatsapp': 'P_BOT_WA'
    };
    
    const playbookId = appTypeToPlaybook[answers.app_type];
    return playbooks.find(p => p.id === playbookId);
  }

  function renderWizardResultHTML(data, answers) {
    const r = data.result;
    const rule = data.rule;

    let html = '';

    // Explain
    html += `<div class="result-section">
      <div class="result-explain">${rule.explain_leigo}</div>
    </div>`;

    // Primary Stack
    html += `<div class="result-section">
      <div class="result-section-title">Stack Principal Recomendada</div>
      <div class="result-stack-card primary">
        <div class="result-stack-label primary">⭐ Recomendação Principal</div>
        <div class="result-stack-pills">
          ${r.primary_stack.map(s => `<span class="result-pill highlight">${s}</span>`).join('')}
        </div>
      </div>
    </div>`;

    // Alt Stacks
    if (r.alt_stacks && r.alt_stacks.length) {
      html += `<div class="result-section">
        <div class="result-section-title">Alternativas</div>`;
      r.alt_stacks.forEach(alt => {
        const label = alt.label || 'Alternativa';
        const stack = alt.stack || alt;
        html += `<div class="result-stack-card">
          <div class="result-stack-label alt">${label}</div>
          <div class="result-stack-pills">
            ${(Array.isArray(stack) ? stack : [stack]).map(s => `<span class="result-pill">${s}</span>`).join('')}
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    // 5 Tools to Master
    if (r.tools_to_master && r.tools_to_master.length) {
      html += `<div class="result-section">
        <div class="result-section-title">5 Ferramentas para Dominar</div>
        <div class="result-tools-grid">
          ${r.tools_to_master.slice(0, 5).map((t, i) => `
            <div class="result-tool-card">
              <span class="result-tool-num">${i + 1}</span>
              <span>${t}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    // Checklist
    if (r.checklist && r.checklist.length) {
      html += `<div class="result-section">
        <div class="result-section-title">Checklist de Execução</div>
        <ul class="result-checklist">
          ${r.checklist.map(c => `<li><span class="result-check"></span>${c}</li>`).join('')}
        </ul>
      </div>`;
    }

    // Risks
    if (r.risks && r.risks.length) {
      html += `<div class="result-section">
        <div class="result-section-title">Riscos Comuns</div>
        ${r.risks.map(risk => `
          <div class="result-risk">
            <span class="result-risk-icon">⚠</span>
            <span>${risk}</span>
          </div>
        `).join('')}
      </div>`;
    }

    // Prompt Generator
    const playbook = findPlaybookForResult(data);
    if (playbook && playbook.prompt_generator) {
      html += `<div class="result-section">
        <div class="result-section-title">⚡ Gerador de Prompts</div>
        <div class="prompt-generator" data-playbook-id="${playbook.id}">
          <p class="prompt-gen-desc">Personalize o prompt para sua necessidade específica:</p>
          <div class="prompt-gen-form">
            ${playbook.prompt_generator.inputs.map(input => `
              <div class="prompt-gen-input">
                <label>${input.label}</label>
                <input type="text" class="prompt-input" data-input-id="${input.id}" placeholder="${input.placeholder}" />
              </div>
            `).join('')}
          </div>
          <div class="prompt-gen-preview">
            <div class="prompt-preview-label">Preview do Prompt:</div>
            <div class="prompt-preview-box" data-template="${escapeHtml(playbook.prompt_generator.template)}">
              <code id="prompt-preview-code"></code>
            </div>
            <button class="btn btn-secondary prompt-copy-btn" data-playbook-id="${playbook.id}">
              <i data-lucide="copy"></i> Copiar Prompt
            </button>
          </div>
        </div>
      </div>`;
    }

    return html;
  }

  function initPromptGenerator() {
    const promptInputs = document.querySelectorAll('.prompt-input');
    const previewBox = document.querySelector('.prompt-preview-box');
    
    if (!promptInputs.length || !previewBox) return;
    
    function updatePromptPreview() {
      const template = previewBox.dataset.template;
      let prompt = template;
      
      promptInputs.forEach(input => {
        const inputId = input.dataset.inputId;
        const value = input.value || '';
        const regex = new RegExp('{{\\s*' + inputId + '\\s*}}', 'g');
        prompt = prompt.replace(regex, value);
      });
      
      const stackElement = document.querySelector('.result-stack-pills');
      if (stackElement) {
        const stackItems = Array.from(stackElement.querySelectorAll('.result-pill')).map(p => p.textContent).join(', ');
        prompt = prompt.replace(/{{\s*stack_recomendada\s*}}/g, stackItems);
      }
      
      const codeEl = document.getElementById('prompt-preview-code');
      if (codeEl) {
        codeEl.textContent = prompt;
      }
    }
    
    promptInputs.forEach(input => {
      input.addEventListener('input', updatePromptPreview);
    });
    
    updatePromptPreview();
    
    const copyBtn = document.querySelector('.prompt-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const promptText = document.getElementById('prompt-preview-code').textContent;
        navigator.clipboard.writeText(promptText).then(() => {
          showToast('Prompt copiado para a area de transferencia!', 'success');
        }).catch(() => {
          showToast('Erro ao copiar. Tente novamente.', 'error');
        });
      });
    }
  }

  // ============================================
  // CONTROLS
  // ============================================
  function initControls() {
    // Panel close
    document.getElementById('btn-close-panel').addEventListener('click', closePanel);

    // Expand button
    document.getElementById('btn-expand').addEventListener('click', () => {
      if (currentNodeId) expandNode(currentNodeId);
    });

    // Reset
    document.getElementById('btn-reset').addEventListener('click', resetGraph);

    // Zoom
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    });
    document.getElementById('btn-fit').addEventListener('click', () => {
      cy.fit(undefined, 50);
    });
  }

  function resetGraph() {
    closePanel();
    cy.elements().remove();
    visibleNodes.clear();
    expandedNodes.clear();
    expandedNodes.add('L0');

    const initialNodes = getInitialNodes();
    const initialEdges = getEdgesForNodes(initialNodes);

    initialNodes.forEach(n => {
      visibleNodes.add(n.id);
      cy.add({
        data: {
          id: n.id,
          label: n.name,
          type: n.type,
          level: n.level,
          color: TYPE_COLORS[n.type] || '#6b7280'
        }
      });
    });

    initialEdges.forEach(e => {
      cy.add({
        data: {
          id: e.from + '-' + e.to,
          source: e.from,
          target: e.to,
          relation: e.relation
        }
      });
    });

    cy.layout(getLayout(initialNodes.length)).run();

    // Reset breadcrumb
    document.getElementById('breadcrumb-trail').innerHTML = '<span class="crumb active">Jornada</span>';

    updateStats();
    showToast('Mapa resetado.', 'info');
  }

  function updateStats() {
    document.getElementById('stat-nodes').textContent = visibleNodes.size + ' nós';
    document.getElementById('stat-edges').textContent = cy.edges().length + ' conexões';
  }

  // ============================================
  // TOAST
  // ============================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================
  // START
  // ============================================
  document.addEventListener('DOMContentLoaded', init);

})();
