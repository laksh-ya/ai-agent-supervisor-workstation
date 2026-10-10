import React, { useEffect, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalBody, Text, Textarea, Button, Flex, Box, Wrap, WrapItem
} from '@chakra-ui/react';

const SUGGESTIONS = [
  'Refund approved. Confirm the 3 to 5 day timeline and close.',
  'Customer verified; do not ask for identity again.',
  'Offer expedited shipping if the customer follows up.',
  'Escalate immediately if the customer mentions legal action.'
];

const ReturnToAiModal = ({ isOpen, onClose, onConfirm, agentName, busy }) => {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (isOpen) setNotes(''); }, [isOpen]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent bg="brand.100" p="28px" borderRadius="24px">
        <ModalBody p={0}>
          <Text fontFamily="display" fontSize="20px" fontWeight={500} color="ink.700">Return control to {agentName}</Text>
          <Text fontSize="12px" color="ink.400" mt="6px">
            Guidance goes into the transcript and case notes, so the AI picks up with full context.
          </Text>
          <Box bg="white" borderRadius="18px" p="20px" mt="18px">
            <Text as="label" htmlFor="handoff-notes" fontFamily="display" fontSize="11.4px" fontWeight={500} color="#847f8a">Notes for the AI agent</Text>
            <Textarea id="handoff-notes" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} mt="5px"
              placeholder="Refund of ₹8,420 approved. Confirm the timeline and close."
              borderColor="#98949d" borderWidth="0.6px" borderRadius="9px" fontSize="13px" />
            <Wrap spacing="6px" mt="10px">
              {SUGGESTIONS.map((s) => (
                <WrapItem key={s}>
                  <Button size="xs" variant="soft" h="24px" fontWeight={500} fontSize="10px" borderRadius="12px" onClick={() => setNotes((n) => (n ? `${n} ${s}` : s))}>
                    {s}
                  </Button>
                </WrapItem>
              ))}
            </Wrap>
          </Box>
          <Flex justify="flex-end" gap="9px" mt="20px">
            <Button onClick={onClose} bg="line.100" color="ink.700" fontFamily="display" fontWeight={500} fontSize="16px" h="40px" px="18px" borderRadius="18px" _hover={{ bg: '#e4e2e8' }}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(notes.trim())} isLoading={busy} bg="brand.600" fontFamily="display" fontWeight={500} fontSize="16px" h="40px" px="18px" borderRadius="18px">
              Return control
            </Button>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ReturnToAiModal;
