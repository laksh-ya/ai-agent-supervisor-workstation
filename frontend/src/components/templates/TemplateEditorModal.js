// Create / Edit Template — Quill editor (the toolbar in the design is Quill's snow toolbar).
// Variables are atomic embeds rendered as <user name>; they serialise to {{user_name}}.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, Box, Flex, Text, Input, Button, Select, FormControl, FormErrorMessage,
  Menu, MenuButton, MenuList, MenuItemOption, MenuOptionGroup, MenuItem, MenuDivider, Wrap, WrapItem, Tooltip, useToast
} from '@chakra-ui/react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import icons from '../../assets/icons';
import { FigmaIcon } from '../ui';
import { DEFAULT_CATEGORIES, CHANNELS } from './constants';
import { renderRich, extractVariables, PERSONAS, humanizeVariable } from '../../utils/templates';
import * as api from '../../api';

// ---- Quill setup (module scope, registered once) ------------------------------------------
const Embed = Quill.import('blots/embed');
class VariableBlot extends Embed {
  static create(name) {
    const node = super.create();
    node.setAttribute('data-name', name);
    node.setAttribute('title', `{{${name}}}`);
    node.textContent = `<${humanizeVariable(name)}>`;
    return node;
  }

  static value(node) {
    return node.getAttribute('data-name');
  }
}
VariableBlot.blotName = 'variable';
VariableBlot.tagName = 'span';
VariableBlot.className = 'ql-variable';
Quill.register(VariableBlot, true);

const quillIcons = Quill.import('ui/icons');
quillIcons.undo = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="6 10 4 12 2 10 6 10"></polygon><path class="ql-stroke" d="M8.09,13.91A4.6,4.6,0,0,0,9,14,5,5,0,1,0,4,9"></path></svg>';
quillIcons.redo = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="12 10 14 12 16 10 12 10"></polygon><path class="ql-stroke" d="M9.91,13.91A4.6,4.6,0,0,1,9,14a5,5,0,1,1,5-5"></path></svg>';

const TOOLBAR = [
  ['undo', 'redo'],
  [{ font: [] }],
  [{ size: ['small', false, 'large'] }],
  ['bold', 'italic', 'underline'],
  [{ color: [] }],
  [{ align: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }]
];

const VAR_RX = /\{\{\s*([a-zA-Z]\w*)\s*\}\}/g;
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Stored content → editor HTML (variables become embeds)
function toEditorHtml(content = '') {
  const html = /<[a-z][\s\S]*>/i.test(content) ? content : content.split('\n').map((l) => `<p>${escape(l) || '<br>'}</p>`).join('');
  return html.replace(VAR_RX, (m, name) => `<span class="ql-variable" data-name="${name}">&lt;${humanizeVariable(name)}&gt;</span>`);
}

// Editor DOM → stored content (embeds become {{name}})
function fromEditor(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('.ql-variable').forEach((el) => el.replaceWith(document.createTextNode(`{{${el.getAttribute('data-name')}}}`)));
  return clone.innerHTML.replace(/﻿/g, '').replace(/<p><br><\/p>$/, '');
}

const isBlank = (html) => !html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();

const QUICK_VARS = ['user_name', 'company_name', 'order_number', 'case_number', 'expected_date', 'refund_amount', 'supervisor_name'];

const Field = ({ label, error, children }) => (
  <FormControl isInvalid={!!error}>
    <Text fontFamily="display" fontWeight={500} fontSize="11.4px" color="#847f8a" mb="4.5px">{label}</Text>
    {children}
    {error && <FormErrorMessage fontSize="11px" mt="4px">{error}</FormErrorMessage>}
  </FormControl>
);

const inputStyle = {
  h: '38px', px: '18px', fontFamily: 'display', fontSize: '14px', color: '#322a3c', bg: 'white',
  borderColor: '#98949d', borderWidth: '0.57px', borderRadius: '9px', _placeholder: { color: '#98949d' }
};

const TemplateEditorModal = ({ isOpen, onClose, template, categories = [], onSaved }) => {
  const toast = useToast();
  const quillRef = useRef(null);
  const editing = !!template?.id;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Onboarding');
  const [channels, setChannels] = useState(['Chat']);
  const [shared, setShared] = useState(true);
  const [cta, setCta] = useState('');
  const [html, setHtml] = useState('');
  const [initialHtml, setInitialHtml] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [newVar, setNewVar] = useState('');
  const [personaId, setPersonaId] = useState('placeholders');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(template?.name || '');
    setDescription(template?.description || (editing ? '' : 'Greet new visitors and offer help'));
    setCategory(template?.category || 'Onboarding');
    setChannels(template?.channels?.length ? template.channels : ['Chat']);
    setShared(template?.isShared ?? true);
    setCta(template?.ctaLabel || '');
    const start = toEditorHtml(template?.content || (editing ? '' : 'Hi {{user_name}}, welcome to {{company_name}}. How can I help today?'));
    setInitialHtml(start);
    setHtml(start);
    setEditorKey((k) => k + 1); // remount Quill with the new initial content
    setErrors({});
    setPersonaId('placeholders');
  }, [isOpen, template, editing]);

  const modules = useMemo(() => ({
    toolbar: {
      container: TOOLBAR,
      handlers: {
        undo() { this.quill.history.undo(); },
        redo() { this.quill.history.redo(); }
      }
    },
    history: { delay: 600, maxStack: 200, userOnly: true }
  }), []);

  const editor = () => quillRef.current?.getEditor();

  // Typing {{name}} converts it into a variable chip
  const onChange = (value, delta, source, ed) => {
    setHtml(value);
    if (source !== 'user') return;
    const q = editor();
    if (!q) return;
    const text = q.getText();
    const rx = new RegExp(VAR_RX.source, 'g');
    const m = rx.exec(text);
    if (m) {
      setTimeout(() => {
        q.deleteText(m.index, m[0].length, 'api');
        q.insertEmbed(m.index, 'variable', m[1], 'api');
        q.setSelection(m.index + 1, 0, 'api');
      }, 0);
    }
  };

  const insertVariable = (raw) => {
    const nameClean = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!/^[a-z]\w*$/.test(nameClean)) return;
    const q = editor();
    if (!q) return;
    const range = q.getSelection(true) || { index: q.getLength() - 1 };
    q.insertEmbed(range.index, 'variable', nameClean, 'user');
    q.insertText(range.index + 1, ' ', 'user');
    q.setSelection(range.index + 2, 0, 'user');
    setNewVar('');
  };

  const content = () => (editor() ? fromEditor(editor().root) : html);
  const variableNames = useMemo(() => {
    const matches = [...html.matchAll(/data-name="([a-zA-Z]\w*)"/g)].map((m) => m[1]);
    return [...new Set(matches)];
  }, [html]);

  const previewValues = personaId === 'placeholders' ? {} : (PERSONAS.find((p) => p.id === personaId)?.values || {});
  const previewHtml = DOMPurify.sanitize(renderRich(content(), previewValues), { ADD_ATTR: ['title'] });

  const save = async () => {
    const body = content();
    const errs = {};
    if (!name.trim()) errs.name = 'Give the template a name';
    if (isBlank(body)) errs.content = 'Write the message content';
    if (!category) errs.category = 'Choose a category';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const existing = new Map((template?.variables || []).map((v) => [v.name, v.description]));
    const payload = {
      name: name.trim(),
      description: description.trim(),
      category,
      channels,
      content: body,
      ctaLabel: cta.trim() || undefined,
      isShared: shared,
      variables: extractVariables(body).map((n) => ({ name: n, description: existing.get(n) || humanizeVariable(n).replace(/^./, (c) => c.toUpperCase()) }))
    };
    setSaving(true);
    try {
      const saved = editing ? await api.updateTemplate(template.id, payload) : await api.createTemplate(payload);
      toast({ status: 'success', title: editing ? 'Template saved' : 'Template created', description: `${saved.name} · ${saved.isShared ? 'Shared with your team' : 'Private to you'}`, duration: 3000 });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast({ status: 'error', title: 'Template not saved', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])];
  const dirty = html !== initialHtml || name !== (template?.name || '');

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="6xl" closeOnOverlayClick={!dirty} motionPreset="scale">
      <ModalOverlay />
      <ModalContent bg="brand.100" maxW="1136px" w="calc(100vw - 48px)" borderRadius="24px" p="36px" aria-label={editing ? 'Edit template' : 'Create template'}>
        <Flex gap="50px" align="stretch">
          {/* Form */}
          <Flex direction="column" gap="18px" flex="650" minW={0}>
            <Text fontFamily="display" fontWeight={500} fontSize="20px" color="ink.700">{editing ? 'Edit Template' : 'Create Template'}</Text>
            <Flex direction="column" justify="space-between" bg="white" borderRadius="18px" p="27px" flex="1" minH="560px">
              <Flex direction="column" gap="18px">
                <Field label="Name" error={errors.name}>
                  <Input {...inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" autoFocus aria-label="Template name" />
                </Field>
                <Field label="Title">
                  <Input {...inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary shown on the card" aria-label="Title" />
                </Field>
                <Field label="Category" error={errors.category}>
                  <Select {...inputStyle} px="0" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
                    icon={<FigmaIcon src={icons.chevronDown} size={18} />} sx={{ paddingInlineStart: '18px' }}>
                    {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Content" error={errors.content}>
                  <Box className="template-editor" border="0.57px solid" borderColor={errors.content ? 'red.400' : '#98949d'} borderRadius="9px" display="flex" flexDirection="column" overflow="hidden">
                    <ReactQuill ref={quillRef} theme="snow" defaultValue={initialHtml} key={editorKey}
                      onChange={onChange} modules={modules} placeholder="Write the reply. Type {{variable_name}} to add a variable." />
                  </Box>
                </Field>
                <Box>
                  <Flex align="center" justify="space-between" mb="6px">
                    <Text fontFamily="display" fontWeight={500} fontSize="11.4px" color="#847f8a">
                      Variables {variableNames.length ? `· ${variableNames.length} in this template` : ''}
                    </Text>
                    <Tooltip hasArrow label="Filled from the live conversation where possible, such as customer name and order number. Anything left is highlighted for the supervisor before sending.">
                      <Text fontSize="10px" color="ink.300" cursor="help">How variables work</Text>
                    </Tooltip>
                  </Flex>
                  <Wrap spacing="6px">
                    {QUICK_VARS.map((v) => (
                      <WrapItem key={v}>
                        <Button size="xs" h="24px" variant={variableNames.includes(v) ? 'solid' : 'soft'} fontWeight={500} fontSize="10px" borderRadius="12px"
                          onClick={() => insertVariable(v)} aria-label={`Insert ${humanizeVariable(v)} variable`}>
                          &lt;{humanizeVariable(v)}&gt;
                        </Button>
                      </WrapItem>
                    ))}
                    <WrapItem>
                      <Flex as="form" onSubmit={(e) => { e.preventDefault(); insertVariable(newVar); }} align="center" h="24px" border="1px dashed" borderColor="line.400" borderRadius="12px" pl="8px" pr="2px">
                        <Input size="xs" h="20px" w="104px" border="none" px={0} fontSize="10px" placeholder="+ Add variable" value={newVar}
                          onChange={(e) => setNewVar(e.target.value)} aria-label="New variable name" _focusVisible={{ boxShadow: 'none' }} />
                        {newVar && <Button type="submit" size="xs" h="18px" fontSize="9px" px="8px" borderRadius="9px">Add</Button>}
                      </Flex>
                    </WrapItem>
                  </Wrap>
                  <Flex mt="12px" gap="10px" align="center">
                    <Text fontFamily="display" fontWeight={500} fontSize="11.4px" color="#847f8a" whiteSpace="nowrap">Button label</Text>
                    <Input {...inputStyle} h="30px" fontSize="12px" px="12px" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Button text (optional)" aria-label="Call to action label" />
                  </Flex>
                </Box>
              </Flex>

              <Flex justify="space-between" align="center" mt="22px" wrap="wrap" rowGap="16px">
                <Button onClick={() => setShared((s) => !s)} aria-pressed={shared} h="40px" px="18px" borderRadius="18px" fontFamily="display" fontWeight={500} fontSize="16px"
                  bg={shared ? 'brand.600' : 'white'} color={shared ? '#ecebf2' : 'brand.600'} border="1px solid" borderColor="brand.600"
                  _hover={{ bg: shared ? 'brand.700' : 'brand.50' }} rightIcon={shared ? <FigmaIcon src={icons.check} size={18} sx={{ filter: 'brightness(0) invert(0.93)' }} /> : undefined}>
                  Share with Team
                </Button>
                <Flex gap="9px">
                  <Button onClick={onClose} bg="line.100" color="ink.700" h="40px" px="18px" borderRadius="18px" fontFamily="display" fontWeight={500} fontSize="16px" _hover={{ bg: '#e4e2e8' }}>
                    Cancel
                  </Button>
                  <Button onClick={save} isLoading={saving} bg="brand.600" h="40px" px="18px" borderRadius="18px" fontFamily="display" fontWeight={500} fontSize="16px">
                    Save
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          </Flex>

          {/* Preview */}
          <Flex direction="column" gap="18px" flex="386" minW={0}>
            <Text fontFamily="display" fontWeight={500} fontSize="20px" color="ink.700">Preview</Text>
            <Flex bg="white" borderRadius="18px" flex="1" align="center" justify="center" p="14px">
              <Flex w="100%" maxW="358px" bg="white" border="0.87px solid #eaeaea" borderRadius="14px" p="17px" gap="14px" align="flex-start">
                <Menu closeOnSelect={false}>
                  <Tooltip label="Channels this template is written for" hasArrow>
                    <MenuButton as={Box} role="button" tabIndex={0} aria-label="Channels" flexShrink={0} display="flex" alignItems="center" gap="4px" h="21px" px="6px"
                      bg="brand.100" borderRadius="8.7px" fontFamily="display" fontSize="12px" color="#454545" cursor="pointer" _hover={{ bg: 'brand.200' }}>
                      <Flex align="center" gap="3px"><FigmaIcon src={icons.chatSpark} size={14} />{channels[0]}{channels.length > 1 ? ` +${channels.length - 1}` : ''}</Flex>
                    </MenuButton>
                  </Tooltip>
                  <MenuList>
                    <MenuOptionGroup type="checkbox" title="Channels" value={channels}
                      onChange={(v) => setChannels(v.length ? CHANNELS.map((c) => c.id).filter((c) => v.includes(c)) : channels)}>
                      {CHANNELS.map((c) => <MenuItemOption key={c.id} value={c.id}>{c.id}</MenuItemOption>)}
                    </MenuOptionGroup>
                  </MenuList>
                </Menu>
                <Box flex="1" minW={0} fontFamily="display" fontSize="12.1px" lineHeight="1.5" color="ink.700" className="tpl-rich"
                  sx={{ '.tpl-var--missing': { background: 'transparent', boxShadow: 'none', padding: 0, color: '#98949d' } }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }} aria-live="polite" />
                <Menu placement="bottom-end">
                  <MenuButton aria-label="Preview options" borderRadius="6px" flexShrink={0} _focusVisible={{ boxShadow: 'outline' }}>
                    <FigmaIcon src={icons.dotsVertical} size={20.8} />
                  </MenuButton>
                  <MenuList>
                    <MenuOptionGroup type="radio" title="Preview as" value={personaId} onChange={setPersonaId}>
                      <MenuItemOption value="placeholders">Show placeholders</MenuItemOption>
                      {PERSONAS.map((p) => <MenuItemOption key={p.id} value={p.id}>{p.label}</MenuItemOption>)}
                    </MenuOptionGroup>
                    <MenuDivider />
                    <MenuItem onClick={() => navigator.clipboard?.writeText(content().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}>Copy raw text</MenuItem>
                  </MenuList>
                </Menu>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </ModalContent>
    </Modal>
  );
};

export default TemplateEditorModal;
