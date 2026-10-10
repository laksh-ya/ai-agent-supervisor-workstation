// Configuration presets: apply a saved snapshot to the draft, or save the draft as a preset
import React, { useState } from 'react';
import {
  Menu, MenuButton, MenuList, MenuItem, MenuDivider, MenuGroup, Flex, Box, Text, IconButton, Button,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, FormControl, FormLabel, FormErrorMessage
} from '@chakra-ui/react';
import { FiChevronDown, FiTrash2, FiPlus } from 'react-icons/fi';
import { timeAgo } from '../../utils/format';

const PresetsMenu = ({ presets, onApply, onSave, onDelete }) => {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setError('Name the preset'); return; }
    setBusy(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
      setSaving(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu placement="bottom-end" isLazy>
        <MenuButton as={Button} size="xs" h="24px" px="10px" variant="soft" fontSize="10px" borderRadius="12px" rightIcon={<FiChevronDown />} iconSpacing="4px"
          aria-label="Configuration presets">
          Presets
        </MenuButton>
        <MenuList w="280px">
          <MenuGroup title="Apply to draft">
            {!presets.length && <Text fontSize="11px" color="ink.300" px="12px" py="6px">No presets saved yet</Text>}
            {presets.map((p) => (
              <MenuItem key={p.id} onClick={() => onApply(p)} closeOnSelect alignItems="flex-start">
                <Flex justify="space-between" w="100%" gap="8px">
                  <Box minW={0}>
                    <Text fontSize="12px" fontWeight={600} noOfLines={1}>{p.name}</Text>
                    <Text fontSize="10px" color="ink.300" noOfLines={1}>{p.description || `Saved ${timeAgo(p.createdAt)}`}</Text>
                  </Box>
                  <IconButton as="span" role="button" size="xs" variant="ghost" aria-label={`Delete preset ${p.name}`} icon={<FiTrash2 />}
                    color="ink.200" _hover={{ color: 'tint.redText', bg: 'tint.red' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(p); }} />
                </Flex>
              </MenuItem>
            ))}
          </MenuGroup>
          <MenuDivider />
          <MenuItem icon={<FiPlus />} onClick={() => { setError(''); setSaving(true); }}>Save current draft as preset…</MenuItem>
        </MenuList>
      </Menu>

      <Modal isOpen={saving} onClose={() => setSaving(false)} isCentered size="sm">
        <ModalOverlay />
        <ModalContent borderRadius="20px">
          <ModalHeader fontSize="16px">Save configuration preset</ModalHeader>
          <ModalBody>
            <Text fontSize="12px" color="ink.400" mb="12px">Stores parameters, capabilities, knowledge sources and escalation thresholds so they can be applied to any agent.</Text>
            <FormControl isInvalid={!!error}>
              <FormLabel fontSize="12px">Name</FormLabel>
              <Input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Preset name" fontSize="13px"
                onKeyDown={(e) => e.key === 'Enter' && submit()} />
              {error && <FormErrorMessage fontSize="11px">{error}</FormErrorMessage>}
            </FormControl>
            <FormControl mt="10px">
              <FormLabel fontSize="12px">Description (optional)</FormLabel>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use it" fontSize="13px" />
            </FormControl>
          </ModalBody>
          <ModalFooter gap="8px">
            <Button variant="outline" onClick={() => setSaving(false)}>Cancel</Button>
            <Button onClick={submit} isLoading={busy}>Save preset</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default PresetsMenu;
