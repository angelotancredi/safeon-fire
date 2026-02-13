import { useWebRTC as useWebRTCContext } from '../contexts/WebRTCContext';

/**
 * v85 Proxy Hook
 * This hook now simply consumes the global WebRTCContext to ensure
 * that radio state is shared across all pages and persists during navigation.
 */
export const useWebRTC = () => {
    return useWebRTCContext();
};

export default useWebRTC;
