import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DialogTitle } from "@/components/ui/dialog";
import MobileNumberInput from "@/components/MobileNumberInput";

export function DrawerContainer({
    children,
    headerContent,
    footerContent,
    triggerButton,
    extraClasses = "",
}: {
    children: ReactNode;
    headerContent?: ReactNode;
    footerContent?: ReactNode;
    triggerButton?: ReactNode;
    extraClasses?: string;
}) {
    return (
        <Drawer>
            <DrawerTrigger asChild>
                {triggerButton || (
                    <Button variant="outline" className="capitalize">
                        open
                    </Button>
                )}
            </DrawerTrigger>
            <DrawerContent
                className={cn(
                    extraClasses,
                    "border-white/20 data-[vaul-drawer-direction=bottom]:max-h-[90vh] data-[vaul-drawer-direction=top]:max-h-[90vh]"
                )}
            >
                <div className="hidden">
                    <DialogTitle>Title</DialogTitle>
                </div>
                {headerContent && <DrawerHeader>{headerContent}</DrawerHeader>}
                {children}
                {footerContent && <DrawerFooter>{footerContent}</DrawerFooter>}
            </DrawerContent>
        </Drawer>
    );
}
