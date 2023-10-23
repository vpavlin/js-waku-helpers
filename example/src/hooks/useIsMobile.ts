import { useEffect, useMemo, useState } from "react";

export const useIsMobile = () => {
    const [isMobile, setIsMobile] = useState<boolean>(false)
    
    useEffect(() => {
        const regex = /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        setIsMobile(regex.test(navigator.userAgent))
        console.log(` IsMobile: ${regex.test(navigator.userAgent)}`)
    }, [])
        
    return useMemo(() => isMobile, [isMobile])
}
