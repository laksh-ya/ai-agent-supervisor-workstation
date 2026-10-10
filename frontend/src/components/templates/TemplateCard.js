import React from 'react';
import { Box, Flex, Text, IconButton, Tooltip } from '@chakra-ui/react';
import icons from '../../assets/icons';
import { FigmaIcon } from '../ui';
import { THUMBS, journeyStyle, channelStyle } from './constants';

const Tag = ({ style, children }) => (
  <Flex as="span" h="22px" px="10px" minW="66px" align="center" justify="center" borderRadius="12px" bg={style.bg} color={style.fg}
    fontSize="10px" whiteSpace="nowrap">{children}</Flex>
);

function Thumb({ template, onToggleStar }) {
  const t = THUMBS[template.channels?.[0]] || THUMBS.Website;
  return (
    <Flex bg={t.bg} borderRadius="12px" h="72px" px="9px" pt="11px" pb="12px" justify="space-between" align="flex-start">
      <Box w="166px">
        <Flex gap="5px" align="center">
          <Box w="14px" h="14px" borderRadius="full" bg={t.dot} flexShrink={0} />
          <Box flex="1">
            <Box h="4px" w="72%" bg={t.line} borderRadius="full" mb="5px" />
            <Box h="4px" w="100%" bg={t.line} borderRadius="full" opacity={0.7} />
          </Box>
        </Flex>
        <Flex bg="white" h="22px" borderRadius="12px" mt="11px" px="10px" align="center">
          <Box h="5px" w="100%" bg={t.line} borderRadius="full" />
        </Flex>
      </Box>
      <Tooltip label={template.starred ? 'Remove from favourites' : 'Add to favourites'} hasArrow openDelay={300}>
        <Box as="button" type="button" aria-label={template.starred ? `Unstar ${template.name}` : `Star ${template.name}`} aria-pressed={!!template.starred}
          onClick={(e) => { e.stopPropagation(); onToggleStar?.(template); }} p="2px" borderRadius="6px"
          transition="transform 150ms ease" _hover={{ transform: 'scale(1.12)' }} _active={{ transform: 'scale(0.92)' }}
          _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
          <FigmaIcon src={template.starred ? icons.starFilled : icons.star} w="17.6px" h="16.8px" />
        </Box>
      </Tooltip>
    </Flex>
  );
}

const TemplateCard = ({ template, selected, onSelect, onToggleStar, actions, onDelete, onEdit, onUse }) => {
  const j = journeyStyle(template.category);
  const ch = template.channels?.[0];
  return (
    <Flex direction="column" gap="10px">
      <Box as="article" role="button" tabIndex={0} aria-pressed={selected} aria-label={`${template.name} template`}
        onClick={() => onSelect(template)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(template); } }}
        bg="white" border="1px solid" borderColor={selected ? 'transparent' : '#e3e2e8'} borderRadius="12px" p="14px" h="176px" cursor="pointer"
        boxShadow={selected ? 'card' : 'none'} transition="box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease"
        _hover={{ boxShadow: selected ? 'card' : '0 2px 9px rgba(130,130,130,0.14)' }} _focusVisible={{ boxShadow: 'outline', outline: 'none' }}>
        <Thumb template={template} onToggleStar={onToggleStar} />
        <Text fontSize="13px" fontWeight={700} color="#20212b" mt="10px" noOfLines={1}>{template.name}</Text>
        <Text fontSize="10px" color="#6e7180" mt="5px" noOfLines={1}>{template.description || 'No summary'}</Text>
        <Flex justify="space-between" align="center" mt="10px">
          <Flex gap="2px" minW={0}>
            <Tag style={j}>{template.category}</Tag>
            {ch && <Tag style={channelStyle(ch)}>{ch}{template.channels.length > 1 ? ` +${template.channels.length - 1}` : ''}</Tag>}
          </Flex>
          <Text fontSize="10px" color="#6e7180" whiteSpace="nowrap">{template.usageCount} uses</Text>
        </Flex>
      </Box>
      {actions && selected && (
        <Flex gap="24px" justify="center" sx={{ animation: 'actIn 200ms ease-out', '@keyframes actIn': { from: { opacity: 0, transform: 'translateY(-4px)' }, to: { opacity: 1 } } }}>
          <Tooltip label="Delete" hasArrow><IconButton aria-label={`Delete ${template.name}`} icon={<FigmaIcon src={icons.trash} size={16} />} onClick={() => onDelete(template)} w="40px" h="40px" minW="40px" borderRadius="72px" bg="line.100" _hover={{ bg: '#fde4e4' }} /></Tooltip>
          <Tooltip label="Edit" hasArrow><IconButton aria-label={`Edit ${template.name}`} icon={<FigmaIcon src={icons.edit} size={16} />} onClick={() => onEdit(template)} w="40px" h="40px" minW="40px" borderRadius="72px" bg="line.100" _hover={{ bg: '#e8f0fa' }} /></Tooltip>
          <Tooltip label="Use in a conversation" hasArrow><IconButton aria-label={`Use ${template.name} in a conversation`} icon={<FigmaIcon src={icons.arrowRight} size={16} />} onClick={() => onUse(template)} w="40px" h="40px" minW="40px" borderRadius="72px" bg="line.100" _hover={{ bg: '#e7f5ec' }} /></Tooltip>
        </Flex>
      )}
    </Flex>
  );
};

export default TemplateCard;
