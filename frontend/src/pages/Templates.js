// src/pages/Templates.js — Template Governance Workspace
import React, { useMemo, useRef, useState } from 'react';
import {
  Box, Flex, Text, Button, AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, useToast
} from '@chakra-ui/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TemplateWorkspace from '../components/templates/TemplateWorkspace';
import TemplateEditorModal from '../components/templates/TemplateEditorModal';
import useTemplates from '../hooks/useTemplates';
import { useAppData } from '../context/AppDataContext';
import { InitialAvatar, Pill, SEVERITY } from '../components/ui';
import * as api from '../api';

function ChooseConversationModal({ template, onClose }) {
  const { liveList } = useAppData();
  const navigate = useNavigate();
  return (
    <Modal isOpen={!!template} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="24px" p="8px">
        <ModalHeader fontSize="16px" pb="4px">Use “{template?.name}”</ModalHeader>
        <Text fontSize="12px" color="ink.400" px="24px">Choose an open conversation. The reply opens with variables filled from that case.</Text>
        <ModalCloseButton />
        <ModalBody maxH="420px" overflowY="auto" pt="12px">
          <VStack align="stretch" spacing="6px">
            {liveList.map((c) => {
              const sev = SEVERITY[c.risk?.severity] || SEVERITY.stable;
              return (
                <Flex key={c.id} as="button" type="button" onClick={() => navigate(`/conversation/${c.id}?template=${template.id}`)}
                  align="center" gap="10px" p="10px" borderRadius="12px" border="1px solid" borderColor="line.300" textAlign="left"
                  _hover={{ bg: 'brand.100' }} _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
                  <InitialAvatar name={c.customer?.name} />
                  <Box flex="1" minW={0}>
                    <Text fontSize="12px" fontWeight={700} color="ink.800">{c.customer?.name} · #{c.caseNumber}</Text>
                    <Text fontSize="10px" color="ink.300">{c.issue} · {c.queueLabel}</Text>
                  </Box>
                  <Pill tone={sev.tone} h="20px">{sev.label}</Pill>
                </Flex>
              );
            })}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

const Templates = () => {
  const { templates, loading, upsertLocal, removeLocal } = useTemplates();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState(null); // null | {} (new) | template
  const [deleting, setDeleting] = useState(null);
  const [using, setUsing] = useState(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef();
  const toast = useToast();
  const categories = useMemo(() => [...new Set(templates.map((t) => t.category))], [templates]);

  const toggleStar = async (t) => {
    upsertLocal({ ...t, starred: !t.starred });
    try { await api.updateTemplate(t.id, { starred: !t.starred }); } catch (err) { upsertLocal(t); toast({ status: 'error', title: 'Favourite not saved', description: err.message }); }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await api.deleteTemplate(deleting.id);
      removeLocal(deleting.id);
      toast({ status: 'success', title: 'Template deleted', description: deleting.name, duration: 3000 });
      setDeleting(null);
    } catch (err) {
      toast({ status: 'error', title: 'Template not deleted', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex direction="column" gap="16px" h="calc(100vh - 102px)" minH="640px">
      <Flex justify="space-between" align="center" h="56px" flexShrink={0}>
        <Box>
          <Text as="h1" fontFamily="display" fontWeight={600} fontSize="24px" lineHeight="32px" color="ink.900">Template Governance Workspace</Text>
          <Text fontFamily="display" fontSize="11px" lineHeight="18px" color="#7f788e" mt="4px">
            Manage content quality, approvals, localization, performance, and lifecycle
          </Text>
        </Box>
        <Button onClick={() => setEditing({})} w="164px" h="40px" borderRadius="10px" fontFamily="display" fontWeight={600} fontSize="11px">
          Create template
        </Button>
      </Flex>

      <Box flex="1" minH={0}>
        <TemplateWorkspace
          manage
          templates={templates}
          loading={loading}
          initialSelectedId={params.get('template')}
          onToggleStar={toggleStar}
          onDelete={setDeleting}
          onEdit={setEditing}
          onUse={setUsing}
          onCancel={() => {}}
          insertLabel="Insert"
          onInsert={(t) => setUsing(t)}
        />
      </Box>

      <TemplateEditorModal isOpen={!!editing} onClose={() => setEditing(null)} template={editing?.id ? editing : null}
        categories={categories} onSaved={upsertLocal} />

      <ChooseConversationModal template={using} onClose={() => setUsing(null)} />

      <AlertDialog isOpen={!!deleting} leastDestructiveRef={cancelRef} onClose={() => setDeleting(null)} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="20px">
            <AlertDialogHeader fontSize="16px">Delete “{deleting?.name}”?</AlertDialogHeader>
            <AlertDialogBody fontSize="13px" color="ink.500">
              It has been used {deleting?.usageCount} times{deleting?.isShared ? ' and is shared with your team' : ''}. Messages already sent are not affected. This can’t be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap="8px">
              <Button ref={cancelRef} variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button bg="tint.redBar" _hover={{ bg: 'tint.redText' }} onClick={confirmDelete} isLoading={busy}>Delete template</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Flex>
  );
};

export default Templates;
