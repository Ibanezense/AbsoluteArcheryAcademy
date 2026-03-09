"use client"

import * as React from "react"

type Variant =
	| "default"
	| "outline"
	| "ghost"
	| "accent"
	| "destructive"

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant
}

const base =
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50"

const variants: Record<Variant, string> = {
	default:
		"bg-white/10 hover:bg-white/20 text-textpri border border-line",
	outline:
		"border border-line bg-transparent hover:bg-white/10 text-textpri",
	ghost:
		"bg-transparent hover:bg-white/10 text-textsec",
	accent:
		"bg-accent hover:brightness-105 text-white",
	destructive:
		"bg-danger hover:brightness-105 text-white",
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className = "", variant = "default", type = "button", ...props }, ref) => {
		return (
			<button
				ref={ref}
				type={type}
				className={`${base} ${variants[variant]} px-4 py-2 ${className}`}
				{...props}
			/>
		)
	}
)
Button.displayName = "Button"

export default Button

