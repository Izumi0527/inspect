import React, { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ImageIcon } from 'lucide-react'

interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  fill?: boolean
  priority?: boolean
  quality?: number
  blurDataURL?: string
  placeholder?: 'blur' | 'empty'
  sizes?: string
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  className,
  fill,
  priority = false,
  quality = 75,
  blurDataURL,
  placeholder = 'empty',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  ...props
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = () => {
    setIsLoading(false)
  }

  const handleError = () => {
    setIsLoading(false)
    setHasError(true)
  }

  // 生成默认的 blur data URL
  const defaultBlurDataURL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyDqfBc95iGTEqpCdlB7aNs3hc3p4aKYG2xNE6MjRdKyJ6sGlbS2+k0vTBJ4EjQuxVhJkEEOh/3wLQA=='

  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="text-center">
          <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">图片加载失败</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10"
          >
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-border border-t-blue-600"></div>
          </motion.div>
        )}
      </AnimatePresence>

      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        fill={fill}
        priority={priority}
        quality={quality}
        placeholder={placeholder}
        blurDataURL={blurDataURL || defaultBlurDataURL}
        sizes={sizes}
        onLoad={handleLoad}
        onError={handleError}
        className="object-cover"
        {...props}
      />
    </div>
  )
}

// 自适应图像组件，根据设备类型优化
interface ResponsiveImageProps extends OptimizedImageProps {
  mobileWidth?: number
  tabletWidth?: number
  desktopWidth?: number
}

export const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  mobileWidth = 375,
  tabletWidth = 768,
  desktopWidth = 1200,
  ...props
}) => {
  return (
    <OptimizedImage
      {...props}
      sizes={`
        (max-width: 640px) ${mobileWidth}px,
        (max-width: 1024px) ${tabletWidth}px,
        ${desktopWidth}px
      `}
    />
  )
}