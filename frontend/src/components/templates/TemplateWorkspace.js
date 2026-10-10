// Template library (left) · browser (centre) · live preview (right).
// Used full-page in the Template Governance Workspace and as the picker modal in a conversation.
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Grid, Input, InputGroup, InputLeftElement, Select, Text, Button, Menu, MenuButton, MenuList, MenuItemOption, MenuOptionGroup } from '@chakra-ui/react';
import DOMPurify from 'dompurify';
import icons from '../../assets/icons';
import { FigmaIcon, EmptyState, LoadingState } from '../ui';
import TemplateCard from './TemplateCard';
import { JOURNEYS, CATEGORIES, CHANNELS, POPULAR_MIN, LOW_USE_MAX, journeyStyle, QUEUE_JOURNEYS } from './constants';
import { renderRich, extractVariables, variableLabel, PERSONAS } from '../../utils/templates';

// ---------------------------------------------------------------- Library navigation
const NavRow = ({ dot, label, active, bold, count, onClick }) => (
  <Flex as="button" type="button" onClick={onClick} aria-pressed={active} align="center" gap="10px" h="34px" px="12px" w="100%" borderRadius="12px"
    bg={active ? (count !== undefined ? '#f4f1ff' : '#fafafb') : 'transparent'} textAlign="left" transition="background 120ms"
    _hover={{ bg: active ? undefined : '#fafafb' }} _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
    <Box w="8px" h="8px" borderRadius="full" bg={dot} flexShrink={0} />
    <Text fontSize="12px" fontWeight={active || bold ? 700 : 400} color={active && count !== undefined ? '#5e42d6' : '#20212b'} flex="1" noOfLines={1}>{label}</Text>
    {count !== undefined && (
      <Flex h="16px" minW="22px" px="5px" borderRadius="10px" bg="#e6dfff" color="#5e42d6" fontSize="9px" fontWeight={700} align="center" justify="center">{count}</Flex>
    )}
  </Flex>
);

function LibraryNav({ templates, nav, setNav }) {
  const [q, setQ] = useState('');
  const categories = useMemo(() => {
    const known = [...JOURNEYS, ...CATEGORIES];
    const extra = [...new Set(templates.map((t) => t.category))].filter((c) => !known.some((j) => j.id.toLowerCase() === String(c).toLowerCase()));
    return [...known.map((j) => j.id), ...extra];
  }, [templates]);
  const match = (s) => s.toLowerCase().includes(q.trim().toLowerCase());
  const is = (kind, value) => nav.kind === kind && (value === undefined || nav.value === value);
  return (
    <Box w="211px" flexShrink={0} borderRight="1px solid #e6e7eb" pt="19px" px="10px" pb="20px" overflowY="auto" aria-label="Template library">
      <Text fontSize="11px" fontWeight={700} color="#20212b" px="1px">TEMPLATE LIBRARY</Text>
      <InputGroup mt="12px">
        <InputLeftElement pointerEvents="none" h="36px" w="32px"><FigmaIcon src={icons.searchSm} size={13.5} /></InputLeftElement>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories" aria-label="Search categories" h="36px" pl="30px"
          bg="#f7f7f9" borderColor="#e5e6ea" borderRadius="12px" fontSize="12px" />
      </InputGroup>
      <Box mt="14px">
        <NavRow dot="#7a5af8" label="All templates" count={templates.length} active={is('all')} onClick={() => setNav({ kind: 'all' })} />
        {match('popular') && <NavRow dot="#f4b740" label="Popular" active={is('popular')} onClick={() => setNav({ kind: 'popular' })} />}
        {match('low use') && <NavRow dot="#9ca3af" label="Low use" active={is('low')} onClick={() => setNav({ kind: 'low' })} />}
      </Box>
      <Box h="1px" bg="#e6e7eb" w="151px" mx="12px" my="12px" />
      <Text fontSize="10px" fontWeight={700} color="#6e7180" mb="4px" px="1px">BY JOURNEY</Text>
      {categories.filter(match).map((c) => (
        <NavRow key={c} dot={journeyStyle(c).dot} label={c} active={is('journey', c)} bold={is('journey', c)} onClick={() => setNav(is('journey', c) ? { kind: 'all' } : { kind: 'journey', value: c })} />
      ))}
      <Text fontSize="10px" fontWeight={700} color="#6e7180" mt="14px" mb="4px" px="1px">BY CHANNEL</Text>
      {CHANNELS.filter((c) => match(c.id)).map((c) => (
        <NavRow key={c.id} dot={c.dot} label={c.id} active={is('channel', c.id)} onClick={() => setNav(is('channel', c.id) ? { kind: 'all' } : { kind: 'channel', value: c.id })} />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------- Preview panel
function describe(names, template) {
  const labels = names.map((n) => variableLabel(n, template).toLowerCase());
  if (labels.length <= 1) return labels.join('');
  const s = `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PreviewPanel({ template, personaOptions, personaId, setPersonaId, values: baseValues, onCancel, onInsert, insertLabel = 'Insert', insertDisabled, fillable }) {
  // In a conversation the supervisor can fill every variable here and watch the completed message update
  const [overrides, setOverrides] = useState({});
  useEffect(() => { setOverrides({}); }, [template?.id, personaId]);
  const values = { ...baseValues, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => String(v).trim() !== '')) };
  const names = template ? extractVariables(template.content) : [];
  const resolved = names.filter((n) => values[n] !== undefined && values[n] !== null && String(values[n]).trim() !== '');
  const missing = names.filter((n) => !resolved.includes(n));
  const persona = personaOptions.find((p) => p.id === personaId) || personaOptions[0];
  const html = template ? DOMPurify.sanitize(renderRich(template.content, values), { ADD_ATTR: ['title'] }) : '';

  return (
    <Flex direction="column" justify="space-between" w="319px" flexShrink={0} borderLeft="1px solid #e3e4e8" pt="15px" pb="22px" px="20px" overflowY="auto">
      <Box>
        <Text fontSize="16px" fontWeight={700} color="#20212b">Preview</Text>
        <Text fontSize="10px" color="#6e7180" mt="5px">Review the selected reply before inserting.</Text>
        <Text fontSize="11px" fontWeight={700} color="#20212b" mt="18px" mb="10px">PREVIEW AS</Text>
        <Menu matchWidth>
          <MenuButton as={Button} variant="outline" w="100%" h="38px" borderColor="#dcdde3" borderRadius="11px" px="9px" fontWeight={400} color="#20212b" fontSize="12px"
            textAlign="left" rightIcon={<FigmaIcon src={icons.chevron} w="10px" h="6px" />} aria-label="Preview as">
            <Flex align="center" gap="8px"><Box w="16px" h="16px" borderRadius="full" bg="#d9d1ff" />{persona?.label}</Flex>
          </MenuButton>
          <MenuList>
            <MenuOptionGroup type="radio" value={personaId} onChange={setPersonaId}>
              {personaOptions.map((p) => <MenuItemOption key={p.id} value={p.id}>{p.label}</MenuItemOption>)}
            </MenuOptionGroup>
          </MenuList>
        </Menu>

        <Box bg="#f7f7fa" border="1px solid #e7e7eb" borderRadius="12px" px="13px" py="14px" mt="18px">
          <Text fontSize="10px" color="#6e7180">Live preview</Text>
          {template ? (
            <>
              <Flex gap="9px" mt="10px" align="flex-start">
                <Box w="22px" h="22px" borderRadius="full" bg="#d9d1ff" flexShrink={0} />
                <Box bg="white" borderRadius="12px" px="14px" pt="12px" pb="16px" flex="1" fontSize="10px" color="#6e7180" lineHeight="1.45"
                  className="tpl-rich" sx={{ '& p:first-of-type strong': { fontSize: '12px' } }} dangerouslySetInnerHTML={{ __html: html }} />
              </Flex>
              {template.ctaLabel && (
                <Flex justify="center" mt="12px">
                  <Button h="34px" minW="176px" fontSize="12px" borderRadius="12px" tabIndex={-1} aria-hidden>{template.ctaLabel}</Button>
                </Flex>
              )}
            </>
          ) : (
            <EmptyState title="No template selected" hint="Select a card to preview the reply." py="20px" />
          )}
        </Box>

        {fillable && template && names.length > 0 && (
          <Box mt="16px" data-testid="template-variable-form">
            <Text fontSize="11px" fontWeight={700} color="#20212b" mb="8px">FILL IN VARIABLES</Text>
            <Flex direction="column" gap="8px">
              {names.map((n) => {
                const auto = baseValues[n];
                return (
                  <Box key={n}>
                    <Flex justify="space-between" mb="3px">
                      <Text as="label" htmlFor={`var-${n}`} fontSize="10px" color="#6e7180">{variableLabel(n, template)}</Text>
                      <Text fontSize="9px" color={values[n] ? '#287759' : '#b07d16'} fontFamily="mono">{`{{${n}}}`}</Text>
                    </Flex>
                    <Input id={`var-${n}`} size="sm" h="30px" fontSize="12px" borderRadius="9px"
                      value={overrides[n] ?? auto ?? ''} placeholder={`Enter ${variableLabel(n, template).toLowerCase()}`}
                      onChange={(e) => setOverrides((o) => ({ ...o, [n]: e.target.value }))}
                      borderColor={values[n] ? '#bfe6d2' : '#f0d68a'} bg={values[n] ? 'white' : '#fffbeb'} />
                  </Box>
                );
              })}
            </Flex>
          </Box>
        )}
      </Box>

      <Box mt="20px">
        {template && names.length > 0 && (
          missing.length === 0 ? (
            <Flex bg="#eef9f3" borderRadius="12px" px="12px" py="8px" gap="8px" align="center" role="status">
              <FigmaIcon src={icons.checkCircle} size={16} />
              <Box>
                <Text fontSize="12px" fontWeight={700} color="#287759">{resolved.length} variable{resolved.length > 1 ? 's' : ''} resolved</Text>
                <Text fontSize="10px" color="#4d8b70">{describe(resolved, template)}</Text>
              </Box>
            </Flex>
          ) : (
            <Flex bg="tint.amber" borderRadius="12px" px="12px" py="8px" gap="8px" align="center" role="status">
              <Flex w="16px" h="16px" borderRadius="full" bg="#e1a43a" color="white" fontSize="10px" fontWeight={700} align="center" justify="center" flexShrink={0}>!</Flex>
              <Box>
                <Text fontSize="12px" fontWeight={700} color="tint.amberText">
                  {resolved.length}/{names.length} resolved · {missing.length} need{missing.length > 1 ? '' : 's'} input
                </Text>
                <Text fontSize="10px" color="#8a6d25">{describe(missing, template)}. Highlighted in the reply until filled</Text>
              </Box>
            </Flex>
          )
        )}
        {template && names.length === 0 && (
          <Flex bg="#f7f7fa" borderRadius="12px" px="12px" py="10px"><Text fontSize="10px" color="#6e7180">No variables. The reply sends as written.</Text></Flex>
        )}
        <Box h="1px" bg="#e3e4e8" my="12px" />
        <Text fontSize="10px" color="#6e7180">You can edit the message after inserting.</Text>
        <Flex justify="flex-end" gap="10px" mt="20px">
          <Button variant="outline" w="86px" h="36px" borderColor="#d7d8de" color="#20212b" fontSize="12px" onClick={onCancel}>Cancel</Button>
          <Button minW="102px" h="36px" fontSize="12px" onClick={() => onInsert(values)} isDisabled={!template || insertDisabled}>{insertLabel}</Button>
        </Flex>
      </Box>
    </Flex>
  );
}

// ---------------------------------------------------------------- Browser
const TABS = [
  { id: 'all', label: 'All templates' },
  { id: 'team', label: 'My team' },
  { id: 'recent', label: 'Recently used' }
];

const SORTS = [
  { id: 'suggested', label: 'Suggested' },
  { id: 'usage', label: 'Most used' },
  { id: 'recent', label: 'Recently used' },
  { id: 'updated', label: 'Last updated' },
  { id: 'name', label: 'A–Z' }
];

export function useTemplateFilters(templates, { queue } = {}) {
  const [nav, setNav] = useState({ kind: 'all' });
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [sort, setSort] = useState(queue ? 'suggested' : 'usage');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const recentCutoff = Date.now() - 14 * 86400000;
    const suited = new Set((QUEUE_JOURNEYS[queue] || []).map((s) => s.toLowerCase()));
    let out = templates.filter((t) => {
      if (nav.kind === 'popular' && t.usageCount < POPULAR_MIN) return false;
      if (nav.kind === 'low' && t.usageCount >= LOW_USE_MAX) return false;
      if (nav.kind === 'journey' && String(t.category).toLowerCase() !== nav.value.toLowerCase()) return false;
      if (nav.kind === 'channel' && !(t.channels || []).includes(nav.value)) return false;
      if (tab === 'team' && !t.isShared) return false;
      if (tab === 'recent' && !(t.lastUsedAt && new Date(t.lastUsedAt).getTime() > recentCutoff)) return false;
      if (channel && !(t.channels || []).includes(channel)) return false;
      if (needle) {
        const hay = `${t.name} ${t.description || ''} ${t.content} ${t.category} ${(t.channels || []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const by = {
      suggested: (a, b) => (suited.has(String(b.category).toLowerCase()) - suited.has(String(a.category).toLowerCase())) || (b.starred - a.starred) || (b.usageCount - a.usageCount),
      usage: (a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name),
      recent: (a, b) => new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0),
      updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
      name: (a, b) => a.name.localeCompare(b.name)
    }[tab === 'recent' ? 'recent' : sort];
    out = [...out].sort(by);
    return out;
  }, [templates, nav, tab, q, channel, sort, queue]);

  return { list, nav, setNav, tab, setTab, q, setQ, channel, setChannel, sort, setSort, sorts: queue ? SORTS : SORTS.slice(1) };
}

function Browser({ f, templates, loading, selectedId, onSelect, onToggleStar, manage, onDelete, onEdit, onUse }) {
  return (
    <Flex direction="column" flex="1" minW={0} pt="20px" pb="12px" px="18px">
      <Text fontSize="20px" fontWeight={700} color="#20212b">Response Templates</Text>
      <Text fontSize="12px" color="#6e7180" mt="5px">Choose a reply and customize it before inserting.</Text>
      <Flex gap="7px" mt="13px">
        <InputGroup flex="1" maxW="289px" minW="160px">
          <InputLeftElement pointerEvents="none" h="38px"><FigmaIcon src={icons.search} size={13.5} /></InputLeftElement>
          <Input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder="Search title, message, or tag" aria-label="Search templates"
            h="38px" borderColor="#dcdde3" borderRadius="12px" fontSize="12px" pl="34px" />
        </InputGroup>
        <Select value={f.channel} onChange={(e) => f.setChannel(e.target.value)} w="124px" flexShrink={0} h="38px" borderColor="#dcdde3" borderRadius="12px" fontSize="12px" color="#20212b" aria-label="Channel">
          <option value="">All channels</option>
          {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
        </Select>
        <Select value={f.sort} onChange={(e) => f.setSort(e.target.value)} w="126px" flexShrink={0} h="38px" borderColor="#dcdde3" borderRadius="12px" fontSize="12px" color="#20212b" aria-label="Sort templates">
          {f.sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </Flex>
      <Flex justify="space-between" align="center" mt="14px">
        <Flex gap="8px" role="tablist" aria-label="Template scope">
          {TABS.map((t) => {
            const active = f.tab === t.id;
            return (
              <Button key={t.id} role="tab" aria-selected={active} onClick={() => f.setTab(t.id)} h="30px" px="13px" borderRadius="20px" fontSize="11px"
                bg={active ? '#eeeafe' : 'white'} color={active ? '#6547d8' : '#6e7180'} border={active ? 'none' : '1px solid #e1e2e7'}
                _hover={{ bg: active ? '#e6e0fd' : '#fafafb' }}>
                {t.label}
              </Button>
            );
          })}
        </Flex>
        <Text fontSize="10px" color="#6e7180" aria-live="polite">{f.list.length} result{f.list.length === 1 ? '' : 's'}</Text>
      </Flex>
      <Box flex="1" overflowY="auto" mt="14px" mx="-6px" px="6px" pb="8px" pt="2px">
        {loading && !templates.length && <LoadingState label="Loading template library" lines={4} h="120px" />}
        {!loading && !f.list.length && <EmptyState title="No templates match" hint="Clear the search or choose another category or channel." />}
        <Grid templateColumns="repeat(2, minmax(0, 1fr))" columnGap="12px" rowGap="12px" alignItems="start">
          {f.list.map((t) => (
            <TemplateCard key={t.id} template={t} selected={t.id === selectedId} onSelect={onSelect} onToggleStar={onToggleStar}
              actions={manage} onDelete={onDelete} onEdit={onEdit} onUse={onUse} />
          ))}
        </Grid>
      </Box>
    </Flex>
  );
}

// ---------------------------------------------------------------- Workspace
const TemplateWorkspace = ({
  templates, loading, conversation, conversationValues: convValues, manage = false, initialSelectedId,
  onToggleStar, onDelete, onEdit, onUse, onCancel, onInsert, insertLabel, height = '100%'
}) => {
  const f = useTemplateFilters(templates, { queue: conversation?.queue });
  const [selectedId, setSelectedId] = useState(initialSelectedId || null);
  const personaOptions = useMemo(() => [
    ...(conversation ? [{ id: 'conversation', label: `This conversation: ${conversation.customer?.name}`, values: convValues || {} }] : []),
    ...PERSONAS
  ], [conversation, convValues]);
  const [personaId, setPersonaId] = useState(conversation ? 'conversation' : 'new');

  useEffect(() => { if (initialSelectedId) setSelectedId(initialSelectedId); }, [initialSelectedId]);
  // Keep a valid selection as filters change
  useEffect(() => {
    if (!f.list.length) return;
    if (!selectedId || !templates.some((t) => t.id === selectedId)) setSelectedId(f.list[0].id);
  }, [f.list, selectedId, templates]);

  const selected = templates.find((t) => t.id === selectedId) || null;
  const persona = personaOptions.find((p) => p.id === personaId) || personaOptions[0];

  return (
    <Flex bg="white" borderRadius="24px" h={height} minH={0} overflow="hidden" border={manage ? '1px solid #e6e7eb' : 'none'}>
      <LibraryNav templates={templates} nav={f.nav} setNav={f.setNav} />
      <Browser f={f} templates={templates} loading={loading} selectedId={selectedId} onSelect={(t) => setSelectedId(t.id)} onToggleStar={onToggleStar}
        manage={manage} onDelete={onDelete} onEdit={onEdit} onUse={onUse} />
      <PreviewPanel template={selected} personaOptions={personaOptions} personaId={personaId} setPersonaId={setPersonaId}
        values={persona?.values || {}} onCancel={onCancel} insertLabel={insertLabel} fillable={!!conversation}
        onInsert={(vals) => selected && onInsert(selected, vals)} />
    </Flex>
  );
};

export default TemplateWorkspace;
