// src/components/Layout.js — 72px top bar, 19px gutter, rounded sidebar card, content column
import React from 'react';
import { Box, Flex, useBreakpointValue } from '@chakra-ui/react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = ({ children }) => {
  const { pathname } = useLocation();
  const isDashboard = pathname === '/';
  // The expanded (labelled) sidebar is the 1440px design; tablets get the icon rail, phones a drawer
  const wide = useBreakpointValue({ base: false, xl: true }, { ssr: false });
  return (
    <Box minH="100vh" bg="canvas">
      <Header />
      <Flex gap={{ base: '12px', md: '19px' }} px={{ base: '12px', md: '18px' }} pt="13px" pb="17px" align="flex-start"
        // The dashboard is fully responsive; the dense workstation screens keep their desktop layout
        minW={isDashboard ? 0 : '1200px'}>
        <Sidebar expanded={isDashboard && wide} />
        <Box as="main" flex="1" minW={0}>
          {children}
        </Box>
      </Flex>
    </Box>
  );
};

export default Layout;
