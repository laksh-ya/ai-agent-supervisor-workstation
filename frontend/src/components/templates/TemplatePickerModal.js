import React from 'react';
import { Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';
import TemplateWorkspace from './TemplateWorkspace';

const TemplatePickerModal = ({ isOpen, onClose, templates, loading, conversation, values, onInsert, onToggleStar }) => (
  <Modal isOpen={isOpen} onClose={onClose} isCentered size="6xl" scrollBehavior="inside" motionPreset="scale">
    <ModalOverlay />
    <ModalContent maxW="1066px" w="calc(100vw - 48px)" h="640px" maxH="calc(100vh - 48px)" borderRadius="24px" overflow="hidden" aria-label="Response templates">
      <TemplateWorkspace
        templates={templates}
        loading={loading}
        conversation={conversation}
        conversationValues={values}
        onToggleStar={onToggleStar}
        onCancel={onClose}
        onInsert={(template, vals) => { onInsert(template, vals); onClose(); }}
      />
    </ModalContent>
  </Modal>
);

export default TemplatePickerModal;
