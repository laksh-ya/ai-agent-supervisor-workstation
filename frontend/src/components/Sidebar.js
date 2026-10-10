// src/components/Sidebar.js
// Two variants from the design: expanded with labels (Dashboard) and icon rail (all other screens).
// Below the md breakpoint the sidebar is replaced by a drawer opened from the top bar (MobileNav).
import React from 'react';
import {
  Box, Flex, Text, Tooltip, VStack, IconButton, Drawer, DrawerOverlay, DrawerContent, DrawerBody, DrawerCloseButton, useDisclosure
} from '@chakra-ui/react';
import { FiMenu } from 'react-icons/fi';
import { NavLink, useLocation } from 'react-router-dom';
import icons from '../assets/icons';
import { FigmaIcon } from './ui';

export const NAV = [
  { name: 'Dashboard', icon: icons.home, path: '/', match: (p) => p === '/' },
  { name: 'Conversations', icon: icons.ticket, path: '/conversations', match: (p) => p.startsWith('/conversation') },
  { name: 'AI Agents', icon: icons.briefcase, path: '/agent-config', match: (p) => p.startsWith('/agent-config') },
  { name: 'Templates', icon: icons.flash, path: '/templates', match: (p) => p.startsWith('/templates') }
];

export const SETTINGS = { name: 'Settings', icon: icons.settings, path: '/settings', match: (p) => p.startsWith('/settings') };

function NavItem({ item, expanded, active, onNavigate }) {
  const content = (
    <Flex
      as={NavLink}
      to={item.path}
      onClick={onNavigate}
      aria-label={item.name}
      aria-current={active ? 'page' : undefined}
      align="center"
      gap="10px"
      h={expanded ? '38px' : '36px'}
      w={expanded ? '164px' : '36px'}
      px={expanded ? '8px' : 0}
      justify={expanded ? 'flex-start' : 'center'}
      borderRadius="8px"
      bg={active ? 'brand.200' : 'transparent'}
      color="ink.700"
      transition="background 150ms ease"
      _hover={{ bg: active ? 'brand.200' : 'brand.100' }}
      _focusVisible={{ boxShadow: 'outline', outline: 'none' }}
    >
      <FigmaIcon src={item.icon} size={20} />
      {expanded && <Text fontSize="16px" fontWeight={400} color="ink.700" whiteSpace="nowrap">{item.name}</Text>}
    </Flex>
  );
  return expanded ? content : <Tooltip label={item.name} placement="right" hasArrow openDelay={200}>{content}</Tooltip>;
}

const Sidebar = ({ expanded = false }) => {
  const { pathname } = useLocation();
  return (
    <Box
      as="nav"
      aria-label="Primary"
      bg="white"
      borderRadius="24px"
      w={expanded ? '220px' : '92px'}
      flexShrink={0}
      position="sticky"
      top="85px"
      h="calc(100vh - 102px)"
      minH="560px"
      px="28px"
      py="32px"
      display={{ base: 'none', md: 'flex' }}
      flexDirection="column"
      justifyContent="space-between"
      transition="width 200ms ease"
    >
      <VStack spacing="16px" align="stretch">
        {NAV.map((item) => (
          <NavItem key={item.path} item={item} expanded={expanded} active={item.match(pathname)} />
        ))}
      </VStack>
      <NavItem item={SETTINGS} expanded={expanded} active={SETTINGS.match(pathname)} />
    </Box>
  );
};

// Phone-width navigation: hamburger in the top bar → drawer with the expanded nav
export function MobileNav() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { pathname } = useLocation();
  return (
    <>
      <IconButton aria-label="Open navigation" icon={<FiMenu size={20} />} onClick={onOpen} display={{ base: 'inline-flex', md: 'none' }}
        variant="ghost" color="white" _hover={{ bg: 'whiteAlpha.200' }} _active={{ bg: 'whiteAlpha.300' }} mr="4px" minW="36px" h="36px" />
      <Drawer isOpen={isOpen} placement="left" onClose={onClose} size="xs">
        <DrawerOverlay />
        <DrawerContent borderRightRadius="24px" maxW="260px">
          <DrawerCloseButton />
          <DrawerBody as="nav" aria-label="Primary" display="flex" flexDirection="column" justifyContent="space-between" px="28px" py="56px">
            <VStack spacing="16px" align="stretch">
              {NAV.map((item) => <NavItem key={item.path} item={item} expanded active={item.match(pathname)} onNavigate={onClose} />)}
            </VStack>
            <NavItem item={SETTINGS} expanded active={SETTINGS.match(pathname)} onNavigate={onClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export default Sidebar;
