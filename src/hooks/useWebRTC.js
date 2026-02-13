import { useWebRTC as useWebRTCContext } from '../contexts/WebRTCContext';

/**
 * v85 Proxy Hook
 * This hook now simply consumes the global WebRTCContext to ensure
 * that radio state is shared across all pages and persists during navigation.
 */
export const useWebRTC = () => {
    const rtc = useWebRTCContext();
    const { cleanup } = rtc;

    // v112: Minimizing accidental cleanup on component transitions
    // useEffect(() => { return () => cleanup(); }, [cleanup]); // Replaced by:
    /*
    useEffect(() => {
        return () => {
            // cleanup(); // Disabled
        };
    }, [cleanup]);
    */

    return rtc;
};

export default useWebRTC;
